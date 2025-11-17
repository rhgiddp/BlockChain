// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title KONETToken
 * @dev KONET 메인 토큰 컨트랙트
 *
 * 기능:
 * - ERC20 표준 토큰
 * - 소각 가능 (Burnable)
 * - 일시 정지 가능 (Pausable)
 * - 가스리스 트랜잭션 지원 (Permit)
 * - 소유자 권한 관리
 *
 * 토큰 정보:
 * - 이름: KONET
 * - 심볼: KON
 * - 소수점: 18
 * - 총 발행량: 1,000,000,000 KON (10억)
 */
contract KONETToken is ERC20, ERC20Burnable, ERC20Pausable, Ownable, ERC20Permit {
    // 최대 공급량 (10억 토큰)
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;

    // 이벤트
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    /**
     * @dev 생성자
     * @param initialSupply 초기 발행량
     */
    constructor(uint256 initialSupply)
        ERC20("KONET", "KON")
        ERC20Permit("KONET")
        Ownable(msg.sender)
    {
        require(initialSupply <= MAX_SUPPLY, "Initial supply exceeds max supply");
        _mint(msg.sender, initialSupply);
    }

    /**
     * @dev 토큰 발행 (민팅)
     * @param to 받을 주소
     * @param amount 발행할 수량
     *
     * 조건:
     * - 소유자만 호출 가능
     * - 총 공급량이 MAX_SUPPLY를 초과할 수 없음
     * - 컨트랙트가 일시 정지 상태가 아니어야 함
     */
    function mint(address to, uint256 amount) public onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds max supply");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    /**
     * @dev 토큰 일괄 발행
     * @param recipients 받을 주소 배열
     * @param amounts 발행할 수량 배열
     */
    function batchMint(address[] memory recipients, uint256[] memory amounts) public onlyOwner {
        require(recipients.length == amounts.length, "Array length mismatch");

        for (uint256 i = 0; i < recipients.length; i++) {
            mint(recipients[i], amounts[i]);
        }
    }

    /**
     * @dev 토큰 전송 일시 정지
     *
     * 조건:
     * - 소유자만 호출 가능
     * - 긴급 상황에만 사용
     */
    function pause() public onlyOwner {
        _pause();
    }

    /**
     * @dev 토큰 전송 재개
     */
    function unpause() public onlyOwner {
        _unpause();
    }

    /**
     * @dev 토큰 소각 (오버라이드)
     * @param amount 소각할 수량
     */
    function burn(uint256 amount) public override {
        super.burn(amount);
        emit TokensBurned(msg.sender, amount);
    }

    /**
     * @dev 다른 주소의 토큰 소각
     * @param account 소각할 주소
     * @param amount 소각할 수량
     */
    function burnFrom(address account, uint256 amount) public override {
        super.burnFrom(account, amount);
        emit TokensBurned(account, amount);
    }

    /**
     * @dev 긴급 출금 (컨트랙트에 잘못 보낸 ETH 회수)
     */
    function emergencyWithdrawETH() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");

        (bool success, ) = payable(owner()).call{value: balance}("");
        require(success, "ETH transfer failed");

        emit EmergencyWithdraw(owner(), balance);
    }

    /**
     * @dev 긴급 출금 (컨트랙트에 잘못 보낸 다른 토큰 회수)
     * @param token 회수할 토큰 주소
     */
    function emergencyWithdrawToken(address token) public onlyOwner {
        require(token != address(this), "Cannot withdraw own token");

        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");

        bool success = tokenContract.transfer(owner(), balance);
        require(success, "Token transfer failed");
    }

    /**
     * @dev Hook: 전송 전 호출
     * Pausable 기능 적용
     */
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable)
    {
        super._update(from, to, value);
    }

    /**
     * @dev ETH 수신 거부 (fallback)
     */
    receive() external payable {
        revert("This contract does not accept ETH");
    }

    fallback() external payable {
        revert("This contract does not accept ETH");
    }
}
