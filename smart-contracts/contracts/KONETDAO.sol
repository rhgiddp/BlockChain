// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KONETDAO
 * @dev 탈중앙화 자율 조직 (DAO) 거버넌스 시스템
 *
 * 기능:
 * - 제안 생성 및 투표
 * - 타임락 실행
 * - 쿼럼 및 승인 임계값
 * - 위임 투표
 */
contract KONETDAO is Ownable {
    // 거버넌스 토큰
    IERC20 public governanceToken;

    // 제안 상태
    enum ProposalState {
        Pending,    // 대기 중
        Active,     // 투표 진행 중
        Defeated,   // 부결됨
        Succeeded,  // 승인됨
        Queued,     // 대기열에 추가됨
        Executed,   // 실행됨
        Canceled    // 취소됨
    }

    // 제안 구조체
    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        address target;         // 실행할 컨트랙트 주소
        bytes callData;         // 실행할 함수 데이터
        uint256 startBlock;
        uint256 endBlock;
        uint256 forVotes;       // 찬성 투표
        uint256 againstVotes;   // 반대 투표
        uint256 abstainVotes;   // 기권 투표
        bool executed;
        bool canceled;
        mapping(address => bool) hasVoted;
        mapping(address => uint8) votes; // 0: against, 1: for, 2: abstain
    }

    // 설정
    uint256 public votingDelay = 1;         // 제안 후 투표 시작까지 블록 수
    uint256 public votingPeriod = 50400;    // 투표 기간 (약 7일, 12초/블록)
    uint256 public proposalThreshold = 100000 * 1e18;  // 제안 최소 토큰량
    uint256 public quorum = 400000 * 1e18;  // 쿼럼 (최소 참여량)

    // 상태 변수
    uint256 private _proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(address => uint256) public latestProposalIds;

    // 위임
    mapping(address => address) public delegates;
    mapping(address => uint256) public votingPower;

    // 이벤트
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string description,
        uint256 startBlock,
        uint256 endBlock
    );
    event VoteCast(
        address indexed voter,
        uint256 indexed proposalId,
        uint8 support,
        uint256 votes
    );
    event ProposalExecuted(uint256 indexed proposalId);
    event ProposalCanceled(uint256 indexed proposalId);
    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);

    constructor(address _governanceToken) Ownable(msg.sender) {
        require(_governanceToken != address(0), "Invalid token address");
        governanceToken = IERC20(_governanceToken);
    }

    /**
     * @dev 제안 생성
     */
    function propose(
        string memory description,
        address target,
        bytes memory callData
    ) external returns (uint256) {
        require(
            governanceToken.balanceOf(msg.sender) >= proposalThreshold,
            "Below proposal threshold"
        );

        uint256 latestProposalId = latestProposalIds[msg.sender];
        if (latestProposalId != 0) {
            ProposalState state = state(latestProposalId);
            require(
                state != ProposalState.Active,
                "Previous proposal still active"
            );
        }

        uint256 proposalId = ++_proposalCount;
        Proposal storage newProposal = proposals[proposalId];

        newProposal.id = proposalId;
        newProposal.proposer = msg.sender;
        newProposal.description = description;
        newProposal.target = target;
        newProposal.callData = callData;
        newProposal.startBlock = block.number + votingDelay;
        newProposal.endBlock = newProposal.startBlock + votingPeriod;

        latestProposalIds[msg.sender] = proposalId;

        emit ProposalCreated(
            proposalId,
            msg.sender,
            description,
            newProposal.startBlock,
            newProposal.endBlock
        );

        return proposalId;
    }

    /**
     * @dev 투표
     * @param support 0: against, 1: for, 2: abstain
     */
    function castVote(uint256 proposalId, uint8 support) external {
        require(state(proposalId) == ProposalState.Active, "Voting is closed");
        require(support <= 2, "Invalid vote type");

        Proposal storage proposal = proposals[proposalId];
        require(!proposal.hasVoted[msg.sender], "Already voted");

        uint256 votes = getVotes(msg.sender, proposal.startBlock);
        require(votes > 0, "No voting power");

        proposal.hasVoted[msg.sender] = true;
        proposal.votes[msg.sender] = support;

        if (support == 0) {
            proposal.againstVotes += votes;
        } else if (support == 1) {
            proposal.forVotes += votes;
        } else {
            proposal.abstainVotes += votes;
        }

        emit VoteCast(msg.sender, proposalId, support, votes);
    }

    /**
     * @dev 제안 실행
     */
    function execute(uint256 proposalId) external {
        require(
            state(proposalId) == ProposalState.Succeeded,
            "Proposal not succeeded"
        );

        Proposal storage proposal = proposals[proposalId];
        proposal.executed = true;

        // 실행
        (bool success, ) = proposal.target.call(proposal.callData);
        require(success, "Execution failed");

        emit ProposalExecuted(proposalId);
    }

    /**
     * @dev 제안 취소
     */
    function cancel(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(msg.sender == proposal.proposer || msg.sender == owner(), "Not authorized");
        require(!proposal.executed, "Already executed");

        proposal.canceled = true;

        emit ProposalCanceled(proposalId);
    }

    /**
     * @dev 제안 상태 조회
     */
    function state(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.id != 0, "Invalid proposal");

        if (proposal.canceled) {
            return ProposalState.Canceled;
        } else if (proposal.executed) {
            return ProposalState.Executed;
        } else if (block.number <= proposal.startBlock) {
            return ProposalState.Pending;
        } else if (block.number <= proposal.endBlock) {
            return ProposalState.Active;
        } else if (proposal.forVotes <= proposal.againstVotes || proposal.forVotes < quorum) {
            return ProposalState.Defeated;
        } else {
            return ProposalState.Succeeded;
        }
    }

    /**
     * @dev 투표권 위임
     */
    function delegate(address delegatee) external {
        address currentDelegate = delegates[msg.sender];
        delegates[msg.sender] = delegatee;

        emit DelegateChanged(msg.sender, currentDelegate, delegatee);

        _updateVotingPower(msg.sender);
        if (delegatee != address(0)) {
            _updateVotingPower(delegatee);
        }
    }

    /**
     * @dev 투표권 계산
     */
    function getVotes(address account, uint256 blockNumber) public view returns (uint256) {
        // 실제로는 체크포인트 시스템 사용
        address delegatee = delegates[account];
        if (delegatee != address(0)) {
            return 0; // 위임한 경우 투표권 없음
        }
        return governanceToken.balanceOf(account);
    }

    /**
     * @dev 투표권 업데이트 (내부)
     */
    function _updateVotingPower(address account) private {
        votingPower[account] = governanceToken.balanceOf(account);
    }

    /**
     * @dev 설정 업데이트 (소유자만)
     */
    function setVotingDelay(uint256 newDelay) external onlyOwner {
        votingDelay = newDelay;
    }

    function setVotingPeriod(uint256 newPeriod) external onlyOwner {
        votingPeriod = newPeriod;
    }

    function setProposalThreshold(uint256 newThreshold) external onlyOwner {
        proposalThreshold = newThreshold;
    }

    function setQuorum(uint256 newQuorum) external onlyOwner {
        quorum = newQuorum;
    }

    /**
     * @dev 제안 상세 정보
     */
    function getProposal(uint256 proposalId)
        external
        view
        returns (
            address proposer,
            string memory description,
            uint256 startBlock,
            uint256 endBlock,
            uint256 forVotes,
            uint256 againstVotes,
            uint256 abstainVotes,
            bool executed,
            bool canceled
        )
    {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.proposer,
            proposal.description,
            proposal.startBlock,
            proposal.endBlock,
            proposal.forVotes,
            proposal.againstVotes,
            proposal.abstainVotes,
            proposal.executed,
            proposal.canceled
        );
    }
}
