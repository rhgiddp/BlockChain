const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("KONETDAO", function () {
  let dao;
  let governanceToken;
  let owner;
  let addr1;
  let addr2;
  let addr3;

  const VOTING_DELAY = 1; // 1 block
  const VOTING_PERIOD = 50400; // ~1 week in blocks
  const PROPOSAL_THRESHOLD = ethers.parseEther("1000");
  const QUORUM_PERCENTAGE = 400; // 4%

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();

    // 거버넌스 토큰 배포
    const KONETToken = await ethers.getContractFactory("KONETToken");
    governanceToken = await KONETToken.deploy();
    await governanceToken.waitForDeployment();

    // DAO 배포
    const KONETDAO = await ethers.getContractFactory("KONETDAO");
    dao = await KONETDAO.deploy(await governanceToken.getAddress());
    await dao.waitForDeployment();

    // 토큰 분배
    await governanceToken.transfer(addr1.address, ethers.parseEther("5000"));
    await governanceToken.transfer(addr2.address, ethers.parseEther("3000"));
    await governanceToken.transfer(addr3.address, ethers.parseEther("2000"));

    // 위임 (voting power 활성화)
    await governanceToken.connect(addr1).delegate(addr1.address);
    await governanceToken.connect(addr2).delegate(addr2.address);
    await governanceToken.connect(addr3).delegate(addr3.address);
  });

  describe("Deployment", function () {
    it("Should set the correct governance token", async function () {
      expect(await dao.governanceToken()).to.equal(await governanceToken.getAddress());
    });

    it("Should set correct voting parameters", async function () {
      expect(await dao.votingDelay()).to.equal(VOTING_DELAY);
      expect(await dao.votingPeriod()).to.equal(VOTING_PERIOD);
      expect(await dao.proposalThreshold()).to.equal(PROPOSAL_THRESHOLD);
      expect(await dao.quorumPercentage()).to.equal(QUORUM_PERCENTAGE);
    });

    it("Should have zero proposals initially", async function () {
      expect(await dao.proposalCount()).to.equal(0);
    });
  });

  describe("Proposal Creation", function () {
    it("Should allow users with sufficient tokens to create proposal", async function () {
      await expect(
        dao.connect(addr1).propose(
          "Test Proposal",
          "This is a test proposal"
        )
      ).to.emit(dao, "ProposalCreated");
    });

    it("Should increment proposal count", async function () {
      await dao.connect(addr1).propose("Test", "Description");
      expect(await dao.proposalCount()).to.equal(1);
    });

    it("Should set proposal state to Pending initially", async function () {
      await dao.connect(addr1).propose("Test", "Description");
      const proposal = await dao.proposals(1);
      expect(proposal.state).to.equal(0); // Pending
    });

    it("Should not allow users without sufficient tokens to propose", async function () {
      await expect(
        dao.connect(addr3).propose("Test", "Description")
      ).to.be.revertedWith("Insufficient voting power to propose");
    });

    it("Should record correct proposer", async function () {
      await dao.connect(addr1).propose("Test", "Description");
      const proposal = await dao.proposals(1);
      expect(proposal.proposer).to.equal(addr1.address);
    });

    it("Should set correct voting start and end times", async function () {
      await dao.connect(addr1).propose("Test", "Description");
      const proposal = await dao.proposals(1);

      const currentBlock = await ethers.provider.getBlockNumber();
      expect(proposal.voteStart).to.be.gte(currentBlock);
      expect(proposal.voteEnd).to.equal(proposal.voteStart + BigInt(VOTING_PERIOD));
    });
  });

  describe("Voting", function () {
    let proposalId;

    beforeEach(async function () {
      await dao.connect(addr1).propose("Test Proposal", "Test Description");
      proposalId = 1;

      // voting delay 경과
      await time.increase(2);
    });

    it("Should allow eligible voters to vote For", async function () {
      await expect(dao.connect(addr2).vote(proposalId, 1))
        .to.emit(dao, "VoteCast")
        .withArgs(addr2.address, proposalId, 1, await governanceToken.getVotes(addr2.address));
    });

    it("Should allow eligible voters to vote Against", async function () {
      await expect(dao.connect(addr2).vote(proposalId, 2))
        .to.emit(dao, "VoteCast")
        .withArgs(addr2.address, proposalId, 2, await governanceToken.getVotes(addr2.address));
    });

    it("Should allow eligible voters to Abstain", async function () {
      await expect(dao.connect(addr2).vote(proposalId, 3))
        .to.emit(dao, "VoteCast");
    });

    it("Should not allow voting twice", async function () {
      await dao.connect(addr2).vote(proposalId, 1);
      await expect(
        dao.connect(addr2).vote(proposalId, 1)
      ).to.be.revertedWith("Already voted");
    });

    it("Should count votes correctly", async function () {
      await dao.connect(addr1).vote(proposalId, 1); // For: 5000
      await dao.connect(addr2).vote(proposalId, 2); // Against: 3000

      const proposal = await dao.proposals(proposalId);
      expect(proposal.forVotes).to.equal(ethers.parseEther("5000"));
      expect(proposal.againstVotes).to.equal(ethers.parseEther("3000"));
    });

    it("Should record voter's choice", async function () {
      await dao.connect(addr2).vote(proposalId, 1);
      const hasVoted = await dao.hasVoted(proposalId, addr2.address);
      expect(hasVoted).to.be.true;
    });

    it("Should not allow voting on non-existent proposal", async function () {
      await expect(
        dao.connect(addr2).vote(999, 1)
      ).to.be.revertedWith("Invalid proposal ID");
    });

    it("Should not allow voting without voting power", async function () {
      const [, , , , addr4] = await ethers.getSigners();
      await expect(
        dao.connect(addr4).vote(proposalId, 1)
      ).to.be.revertedWith("No voting power");
    });

    it("Should update proposal state to Active after voting starts", async function () {
      await dao.connect(addr1).vote(proposalId, 1);
      const proposal = await dao.proposals(proposalId);
      expect(proposal.state).to.equal(1); // Active
    });
  });

  describe("Proposal Execution", function () {
    let proposalId;

    beforeEach(async function () {
      await dao.connect(addr1).propose(
        "Parameter Change",
        "Change voting period to 100000"
      );
      proposalId = 1;

      // Voting delay 경과
      await time.increase(2);
    });

    it("Should execute proposal when quorum reached and majority votes for", async function () {
      // 투표 (총 10000 토큰, 퀴럼 4% = 400 토큰 필요)
      await dao.connect(addr1).vote(proposalId, 1); // 5000 For
      await dao.connect(addr2).vote(proposalId, 1); // 3000 For

      // Voting period 경과
      await time.increase(VOTING_PERIOD + 1);

      await expect(dao.execute(proposalId))
        .to.emit(dao, "ProposalExecuted")
        .withArgs(proposalId);
    });

    it("Should not execute proposal during voting period", async function () {
      await dao.connect(addr1).vote(proposalId, 1);

      await expect(
        dao.execute(proposalId)
      ).to.be.revertedWith("Voting still in progress");
    });

    it("Should not execute proposal without quorum", async function () {
      // 소수만 투표 (퀴럼 미달)
      await dao.connect(addr3).vote(proposalId, 1); // 2000 < 400 (퀴럼)

      await time.increase(VOTING_PERIOD + 1);

      await expect(
        dao.execute(proposalId)
      ).to.be.revertedWith("Quorum not reached");
    });

    it("Should not execute proposal when majority votes against", async function () {
      await dao.connect(addr1).vote(proposalId, 2); // 5000 Against
      await dao.connect(addr2).vote(proposalId, 1); // 3000 For

      await time.increase(VOTING_PERIOD + 1);

      await expect(
        dao.execute(proposalId)
      ).to.be.revertedWith("Proposal failed");
    });

    it("Should not allow executing already executed proposal", async function () {
      await dao.connect(addr1).vote(proposalId, 1);
      await dao.connect(addr2).vote(proposalId, 1);

      await time.increase(VOTING_PERIOD + 1);

      await dao.execute(proposalId);

      await expect(
        dao.execute(proposalId)
      ).to.be.revertedWith("Proposal already executed");
    });

    it("Should update proposal state to Executed", async function () {
      await dao.connect(addr1).vote(proposalId, 1);
      await dao.connect(addr2).vote(proposalId, 1);

      await time.increase(VOTING_PERIOD + 1);

      await dao.execute(proposalId);

      const proposal = await dao.proposals(proposalId);
      expect(proposal.state).to.equal(3); // Executed
    });
  });

  describe("Proposal Cancellation", function () {
    let proposalId;

    beforeEach(async function () {
      await dao.connect(addr1).propose("Test", "Description");
      proposalId = 1;
    });

    it("Should allow proposer to cancel their proposal", async function () {
      await expect(dao.connect(addr1).cancel(proposalId))
        .to.emit(dao, "ProposalCancelled")
        .withArgs(proposalId);
    });

    it("Should not allow non-proposer to cancel", async function () {
      await expect(
        dao.connect(addr2).cancel(proposalId)
      ).to.be.revertedWith("Only proposer can cancel");
    });

    it("Should not allow cancelling already executed proposal", async function () {
      await time.increase(2);
      await dao.connect(addr1).vote(proposalId, 1);
      await dao.connect(addr2).vote(proposalId, 1);
      await time.increase(VOTING_PERIOD + 1);
      await dao.execute(proposalId);

      await expect(
        dao.connect(addr1).cancel(proposalId)
      ).to.be.revertedWith("Cannot cancel executed proposal");
    });

    it("Should update proposal state to Cancelled", async function () {
      await dao.connect(addr1).cancel(proposalId);

      const proposal = await dao.proposals(proposalId);
      expect(proposal.state).to.equal(4); // Cancelled
    });
  });

  describe("Proposal Queries", function () {
    let proposalId;

    beforeEach(async function () {
      await dao.connect(addr1).propose("Test", "Description");
      proposalId = 1;
    });

    it("Should return proposal details correctly", async function () {
      const proposal = await dao.proposals(proposalId);

      expect(proposal.id).to.equal(proposalId);
      expect(proposal.proposer).to.equal(addr1.address);
      expect(proposal.title).to.equal("Test");
      expect(proposal.description).to.equal("Description");
    });

    it("Should return correct vote counts", async function () {
      await time.increase(2);

      await dao.connect(addr1).vote(proposalId, 1);
      await dao.connect(addr2).vote(proposalId, 2);

      const proposal = await dao.proposals(proposalId);
      expect(proposal.forVotes).to.equal(ethers.parseEther("5000"));
      expect(proposal.againstVotes).to.equal(ethers.parseEther("3000"));
    });

    it("Should return voting status for an address", async function () {
      expect(await dao.hasVoted(proposalId, addr1.address)).to.be.false;

      await time.increase(2);
      await dao.connect(addr1).vote(proposalId, 1);

      expect(await dao.hasVoted(proposalId, addr1.address)).to.be.true;
    });
  });

  describe("Governance Parameters", function () {
    it("Should allow owner to update voting delay", async function () {
      await dao.setVotingDelay(10);
      expect(await dao.votingDelay()).to.equal(10);
    });

    it("Should allow owner to update voting period", async function () {
      await dao.setVotingPeriod(100000);
      expect(await dao.votingPeriod()).to.equal(100000);
    });

    it("Should allow owner to update proposal threshold", async function () {
      await dao.setProposalThreshold(ethers.parseEther("2000"));
      expect(await dao.proposalThreshold()).to.equal(ethers.parseEther("2000"));
    });

    it("Should allow owner to update quorum percentage", async function () {
      await dao.setQuorumPercentage(500); // 5%
      expect(await dao.quorumPercentage()).to.equal(500);
    });

    it("Should not allow non-owner to update parameters", async function () {
      await expect(
        dao.connect(addr1).setVotingDelay(10)
      ).to.be.reverted;
    });

    it("Should emit ParametersUpdated event", async function () {
      await expect(dao.setVotingDelay(10))
        .to.emit(dao, "ParametersUpdated");
    });
  });

  describe("Treasury Management", function () {
    it("Should allow receiving ETH", async function () {
      await owner.sendTransaction({
        to: await dao.getAddress(),
        value: ethers.parseEther("10")
      });

      const balance = await ethers.provider.getBalance(await dao.getAddress());
      expect(balance).to.equal(ethers.parseEther("10"));
    });

    it("Should allow owner to withdraw funds", async function () {
      await owner.sendTransaction({
        to: await dao.getAddress(),
        value: ethers.parseEther("10")
      });

      const balanceBefore = await ethers.provider.getBalance(owner.address);
      await dao.withdraw();
      const balanceAfter = await ethers.provider.getBalance(owner.address);

      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it("Should not allow non-owner to withdraw", async function () {
      await expect(
        dao.connect(addr1).withdraw()
      ).to.be.reverted;
    });
  });

  describe("State Queries", function () {
    let proposalId;

    beforeEach(async function () {
      await dao.connect(addr1).propose("Test", "Description");
      proposalId = 1;
    });

    it("Should return Pending state initially", async function () {
      const proposal = await dao.proposals(proposalId);
      expect(proposal.state).to.equal(0); // Pending
    });

    it("Should return Active state during voting", async function () {
      await time.increase(2);
      await dao.connect(addr1).vote(proposalId, 1);

      const proposal = await dao.proposals(proposalId);
      expect(proposal.state).to.equal(1); // Active
    });

    it("Should return Defeated state when failed", async function () {
      await time.increase(2);
      await dao.connect(addr1).vote(proposalId, 2); // Against

      await time.increase(VOTING_PERIOD + 1);

      const proposal = await dao.proposals(proposalId);
      expect(proposal.state).to.equal(2); // Defeated
    });

    it("Should calculate quorum correctly", async function () {
      const totalSupply = await governanceToken.totalSupply();
      const expectedQuorum = (totalSupply * BigInt(QUORUM_PERCENTAGE)) / 10000n;

      const quorum = await dao.quorum();
      expect(quorum).to.equal(expectedQuorum);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle proposal with zero votes", async function () {
      await dao.connect(addr1).propose("Test", "Description");
      await time.increase(VOTING_PERIOD + 2);

      await expect(
        dao.execute(1)
      ).to.be.revertedWith("Quorum not reached");
    });

    it("Should handle tie votes (equal for and against)", async function () {
      await dao.connect(addr1).propose("Test", "Description");
      await time.increase(2);

      await dao.connect(addr1).vote(1, 1); // 5000 For
      await dao.connect(addr2).vote(1, 2); // 3000 Against
      await dao.connect(addr3).vote(1, 2); // 2000 Against (total 5000)

      await time.increase(VOTING_PERIOD + 1);

      // 동점일 경우 실패 (For > Against 필요)
      await expect(
        dao.execute(1)
      ).to.be.revertedWith("Proposal failed");
    });

    it("Should handle abstain votes correctly", async function () {
      await dao.connect(addr1).propose("Test", "Description");
      await time.increase(2);

      await dao.connect(addr1).vote(1, 3); // Abstain
      await dao.connect(addr2).vote(1, 1); // For

      const proposal = await dao.proposals(1);
      expect(proposal.abstainVotes).to.equal(ethers.parseEther("5000"));
    });
  });
});
