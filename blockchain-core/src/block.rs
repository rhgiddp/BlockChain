/// 블록 구조 정의
///
/// 블록체인의 기본 단위인 블록을 표현합니다.
/// 각 블록은 거래 데이터, 타임스탬프, 이전 블록의 해시 등을 포함합니다.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::transaction::Transaction;

/// 블록 구조체
///
/// # 필드 설명
/// - `index`: 블록 번호 (0부터 시작, 제네시스 블록은 0)
/// - `timestamp`: 블록 생성 시간
/// - `transactions`: 블록에 포함된 거래 목록
/// - `previous_hash`: 이전 블록의 해시값 (체인 연결)
/// - `hash`: 현재 블록의 해시값
/// - `nonce`: 작업 증명(PoW)에 사용되는 값
/// - `difficulty`: 채굴 난이도
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub index: u64,
    pub timestamp: DateTime<Utc>,
    pub transactions: Vec<Transaction>,
    pub previous_hash: String,
    pub hash: String,
    pub nonce: u64,
    pub difficulty: u32,
}

impl Block {
    /// 새로운 블록 생성
    ///
    /// # 예제
    /// ```
    /// use blockchain_core::block::Block;
    /// use blockchain_core::transaction::Transaction;
    ///
    /// let transactions = vec![];
    /// let block = Block::new(0, transactions, String::from("0"));
    /// assert_eq!(block.index, 0);
    /// ```
    pub fn new(index: u64, transactions: Vec<Transaction>, previous_hash: String) -> Self {
        let timestamp = Utc::now();
        let difficulty = 2; // 기본 난이도
        let mut block = Block {
            index,
            timestamp,
            transactions,
            previous_hash,
            hash: String::new(),
            nonce: 0,
            difficulty,
        };

        // 블록 해시 계산
        block.hash = block.calculate_hash();
        block
    }

    /// 제네시스 블록 (최초 블록) 생성
    ///
    /// # 설명
    /// 제네시스 블록은 블록체인의 첫 번째 블록입니다.
    /// 이전 블록이 없으므로 previous_hash는 "0"입니다.
    pub fn genesis() -> Self {
        log::info!("제네시스 블록 생성 중...");
        Block::new(0, vec![], String::from("0"))
    }

    /// 블록 해시 계산
    ///
    /// SHA-256 해싱 알고리즘을 사용하여 블록의 고유 해시값을 계산합니다.
    ///
    /// # 해시에 포함되는 데이터
    /// - index
    /// - timestamp
    /// - transactions (JSON 직렬화)
    /// - previous_hash
    /// - nonce
    /// - difficulty
    pub fn calculate_hash(&self) -> String {
        let transactions_json = serde_json::to_string(&self.transactions)
            .unwrap_or_else(|_| String::from("[]"));

        let data = format!(
            "{}{}{}{}{}{}",
            self.index,
            self.timestamp.to_rfc3339(),
            transactions_json,
            self.previous_hash,
            self.nonce,
            self.difficulty
        );

        let mut hasher = Sha256::new();
        hasher.update(data.as_bytes());
        let result = hasher.finalize();

        // 해시를 16진수 문자열로 변환
        hex::encode(result)
    }

    /// 작업 증명 (Proof of Work) 채굴
    ///
    /// # 설명
    /// 난이도에 맞는 해시를 찾을 때까지 nonce를 증가시키며 반복합니다.
    /// 예: difficulty=2이면 해시가 "00..."으로 시작해야 함
    ///
    /// # 예제
    /// ```no_run
    /// use blockchain_core::block::Block;
    ///
    /// let mut block = Block::genesis();
    /// block.mine(); // 채굴 시작 (시간이 걸림)
    /// assert!(block.hash.starts_with("00"));
    /// ```
    pub fn mine(&mut self) {
        let target = "0".repeat(self.difficulty as usize);

        log::info!(
            "블록 #{} 채굴 시작... (난이도: {})",
            self.index,
            self.difficulty
        );

        let start = std::time::Instant::now();

        loop {
            self.hash = self.calculate_hash();

            // 해시가 목표 난이도를 만족하는지 확인
            if self.hash.starts_with(&target) {
                log::info!(
                    "블록 #{} 채굴 성공! Nonce: {}, 소요 시간: {:?}",
                    self.index,
                    self.nonce,
                    start.elapsed()
                );
                break;
            }

            self.nonce += 1;

            // 진행 상황 로그 (100만 번마다)
            if self.nonce % 1_000_000 == 0 {
                log::debug!("Nonce: {}, 현재 해시: {}", self.nonce, &self.hash[..10]);
            }
        }
    }

    /// 블록 검증
    ///
    /// # 검증 항목
    /// 1. 저장된 해시와 계산된 해시가 일치하는지
    /// 2. 작업 증명이 유효한지 (난이도 조건 충족)
    ///
    /// # 반환값
    /// - `true`: 블록이 유효함
    /// - `false`: 블록이 무효함
    pub fn is_valid(&self) -> bool {
        // 1. 해시 일치 여부 확인
        if self.hash != self.calculate_hash() {
            log::warn!("블록 #{}: 해시 불일치", self.index);
            return false;
        }

        // 2. 작업 증명 확인
        let target = "0".repeat(self.difficulty as usize);
        if !self.hash.starts_with(&target) {
            log::warn!("블록 #{}: 작업 증명 실패", self.index);
            return false;
        }

        // 3. 거래 검증
        for tx in &self.transactions {
            if !tx.is_valid() {
                log::warn!("블록 #{}: 무효한 거래 발견", self.index);
                return false;
            }
        }

        true
    }

    /// 블록 크기 계산 (바이트)
    pub fn size(&self) -> usize {
        bincode::serialize(self).unwrap_or_default().len()
    }

    /// 블록에 포함된 거래 수
    pub fn transaction_count(&self) -> usize {
        self.transactions.len()
    }

    /// 블록 보상 계산
    ///
    /// 채굴자에게 주어지는 보상을 계산합니다.
    /// 비트코인처럼 일정 블록마다 보상이 반감됩니다.
    pub fn calculate_reward(&self) -> u64 {
        let initial_reward = 50; // 초기 보상
        let halving_interval = 210_000; // 반감기 (블록 수)

        let halvings = self.index / halving_interval;
        if halvings >= 64 {
            return 0; // 최대 반감 횟수 초과
        }

        initial_reward >> halvings
    }
}

// Display 트레이트 구현 (예쁘게 출력)
impl std::fmt::Display for Block {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Block #{}\n  Hash: {}\n  Previous: {}\n  Time: {}\n  Transactions: {}\n  Nonce: {}",
            self.index,
            &self.hash[..16],
            &self.previous_hash[..16],
            self.timestamp.format("%Y-%m-%d %H:%M:%S"),
            self.transactions.len(),
            self.nonce
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_genesis_block() {
        let block = Block::genesis();
        assert_eq!(block.index, 0);
        assert_eq!(block.previous_hash, "0");
        assert_eq!(block.transactions.len(), 0);
    }

    #[test]
    fn test_hash_calculation() {
        let block = Block::genesis();
        let hash1 = block.calculate_hash();
        let hash2 = block.calculate_hash();
        assert_eq!(hash1, hash2); // 같은 데이터는 같은 해시
    }

    #[test]
    fn test_block_validation() {
        let block = Block::genesis();
        assert!(block.is_valid());
    }

    #[test]
    fn test_mining() {
        let mut block = Block::genesis();
        block.difficulty = 2; // 낮은 난이도로 테스트
        block.mine();

        assert!(block.hash.starts_with("00"));
        assert!(block.is_valid());
    }

    #[test]
    fn test_block_reward() {
        let block1 = Block::new(0, vec![], String::from("0"));
        assert_eq!(block1.calculate_reward(), 50);

        let block2 = Block::new(210_000, vec![], String::from("0"));
        assert_eq!(block2.calculate_reward(), 25);

        let block3 = Block::new(420_000, vec![], String::from("0"));
        assert_eq!(block3.calculate_reward(), 12);
    }

    #[test]
    fn test_invalid_block() {
        let mut block = Block::genesis();
        block.mine();

        // 데이터 변조
        block.index = 999;

        // 검증 실패해야 함
        assert!(!block.is_valid());
    }
}
