// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KONETNFT
 * @dev VRF 기반 공정한 NFT 민팅 시스템
 *
 * 기능:
 * - VRF (Verifiable Random Function) 기반 랜덤 민팅
 * - 희귀도 시스템
 * - 로열티 자동 분배
 * - 메타데이터 관리
 */
contract KONETNFT is ERC721, ERC721URIStorage, ERC721Burnable, Ownable {
    // 희귀도 등급
    enum Rarity {
        COMMON,     // 50%
        UNCOMMON,   // 30%
        RARE,       // 15%
        EPIC,       // 4%
        LEGENDARY   // 1%
    }

    // NFT 메타데이터
    struct NFTMetadata {
        uint256 tokenId;
        Rarity rarity;
        uint256 mintedAt;
        address originalCreator;
        uint256 generation;  // 세대 (부모 NFT로부터 생성된 경우)
    }

    // 로열티 정보
    struct RoyaltyInfo {
        address recipient;
        uint96 royaltyBps;  // Basis points (100 = 1%)
    }

    // 상태 변수
    uint256 private _nextTokenId;
    uint256 public maxSupply = 10000;
    uint256 public mintPrice = 0.1 ether;
    bool public publicMintEnabled = false;

    mapping(uint256 => NFTMetadata) public nftMetadata;
    mapping(uint256 => RoyaltyInfo) public royalties;
    mapping(Rarity => uint256) public raritySupply;
    mapping(address => bool) public whitelist;

    // VRF 시뮬레이션 (실제로는 Chainlink VRF 사용)
    uint256 private _vrfSeed;

    // 이벤트
    event NFTMinted(address indexed to, uint256 indexed tokenId, Rarity rarity);
    event RoyaltySet(uint256 indexed tokenId, address recipient, uint96 royaltyBps);
    event WhitelistUpdated(address indexed user, bool status);

    constructor() ERC721("KONET NFT", "KNFT") Ownable(msg.sender) {
        _vrfSeed = uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao)));
    }

    /**
     * @dev 공개 민팅 활성화/비활성화
     */
    function setPublicMintEnabled(bool enabled) external onlyOwner {
        publicMintEnabled = enabled;
    }

    /**
     * @dev 화이트리스트 추가/제거
     */
    function setWhitelist(address user, bool status) external onlyOwner {
        whitelist[user] = status;
        emit WhitelistUpdated(user, status);
    }

    /**
     * @dev 민팅 가격 설정
     */
    function setMintPrice(uint256 price) external onlyOwner {
        mintPrice = price;
    }

    /**
     * @dev 화이트리스트 민팅
     */
    function whitelistMint() external payable {
        require(whitelist[msg.sender], "Not whitelisted");
        require(msg.value >= mintPrice, "Insufficient payment");

        _mintNFT(msg.sender);
    }

    /**
     * @dev 공개 민팅
     */
    function publicMint() external payable {
        require(publicMintEnabled, "Public mint not enabled");
        require(msg.value >= mintPrice, "Insufficient payment");

        _mintNFT(msg.sender);
    }

    /**
     * @dev 소유자 민팅 (무료)
     */
    function ownerMint(address to, uint256 count) external onlyOwner {
        for (uint256 i = 0; i < count; i++) {
            _mintNFT(to);
        }
    }

    /**
     * @dev 내부 민팅 로직
     */
    function _mintNFT(address to) private {
        uint256 tokenId = _nextTokenId++;
        require(tokenId < maxSupply, "Max supply reached");

        // VRF 기반 희귀도 결정
        Rarity rarity = _determineRarity(tokenId);

        // NFT 발행
        _safeMint(to, tokenId);

        // 메타데이터 저장
        nftMetadata[tokenId] = NFTMetadata({
            tokenId: tokenId,
            rarity: rarity,
            mintedAt: block.timestamp,
            originalCreator: to,
            generation: 0
        });

        // 희귀도별 공급량 증가
        raritySupply[rarity]++;

        // 기본 로열티 설정 (5%)
        royalties[tokenId] = RoyaltyInfo({
            recipient: to,
            royaltyBps: 500
        });

        emit NFTMinted(to, tokenId, rarity);
    }

    /**
     * @dev VRF 기반 희귀도 결정
     *
     * 확률:
     * - COMMON: 50%
     * - UNCOMMON: 30%
     * - RARE: 15%
     * - EPIC: 4%
     * - LEGENDARY: 1%
     */
    function _determineRarity(uint256 tokenId) private returns (Rarity) {
        // VRF 시뮬레이션 (실제로는 Chainlink VRF 사용)
        _vrfSeed = uint256(keccak256(abi.encodePacked(
            _vrfSeed,
            tokenId,
            block.timestamp,
            block.prevrandao,
            msg.sender
        )));

        uint256 rand = _vrfSeed % 100;

        if (rand < 1) {
            return Rarity.LEGENDARY;  // 1%
        } else if (rand < 5) {
            return Rarity.EPIC;       // 4%
        } else if (rand < 20) {
            return Rarity.RARE;       // 15%
        } else if (rand < 50) {
            return Rarity.UNCOMMON;   // 30%
        } else {
            return Rarity.COMMON;     // 50%
        }
    }

    /**
     * @dev 로열티 설정
     */
    function setRoyalty(
        uint256 tokenId,
        address recipient,
        uint96 royaltyBps
    ) external {
        require(_ownerOf(tokenId) == msg.sender, "Not token owner");
        require(royaltyBps <= 1000, "Royalty too high"); // 최대 10%

        royalties[tokenId] = RoyaltyInfo({
            recipient: recipient,
            royaltyBps: royaltyBps
        });

        emit RoyaltySet(tokenId, recipient, royaltyBps);
    }

    /**
     * @dev EIP-2981 로열티 정보 조회
     */
    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) external view returns (address receiver, uint256 royaltyAmount) {
        RoyaltyInfo memory royalty = royalties[tokenId];
        uint256 amount = (salePrice * royalty.royaltyBps) / 10000;
        return (royalty.recipient, amount);
    }

    /**
     * @dev 메타데이터 URI 설정
     */
    function setTokenURI(uint256 tokenId, string memory uri) external {
        require(_ownerOf(tokenId) == msg.sender || msg.sender == owner(), "Not authorized");
        _setTokenURI(tokenId, uri);
    }

    /**
     * @dev 베이스 URI 설정
     */
    string private _baseTokenURI;

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    /**
     * @dev 배치 전송
     */
    function batchTransfer(address to, uint256[] calldata tokenIds) external {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            safeTransferFrom(msg.sender, to, tokenIds[i]);
        }
    }

    /**
     * @dev 사용자별 토큰 조회
     */
    function tokensOfOwner(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory tokens = new uint256[](balance);
        uint256 index = 0;

        for (uint256 i = 0; i < _nextTokenId && index < balance; i++) {
            if (_ownerOf(i) == owner) {
                tokens[index++] = i;
            }
        }

        return tokens;
    }

    /**
     * @dev 희귀도별 통계
     */
    function getRarityStats() external view returns (uint256[5] memory) {
        return [
            raritySupply[Rarity.COMMON],
            raritySupply[Rarity.UNCOMMON],
            raritySupply[Rarity.RARE],
            raritySupply[Rarity.EPIC],
            raritySupply[Rarity.LEGENDARY]
        ];
    }

    /**
     * @dev 수익 인출
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev 필수 오버라이드
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
