/// 블록체인 메인 구조
///
/// 전체 블록체인을 관리하는 핵심 모듈입니다.

use std::collections::HashMap;

use crate::block::Block;
use crate::transaction::{Transaction, TransactionPool};

/// 블록체인 구조체
///
/// # 필드 설명
/// - `chain`: 블록들의 체인 (벡터)
/// - `difficulty`: 채굴 난이도
/// - `pending_transactions`: 대기 중인 트랜잭션 풀
/// - `mining_reward`: 채굴 보상
/// - `balances`: 각 주소별 잔액 (간단한 UTXO 모델)
pub struct Blockchain {
    pub chain: Vec<Block>,
    pub difficulty: u32,
    pub pending_transactions: TransactionPool,
    pub mining_reward: u64,
    balances: HashMap<String, u64>,
}

impl Blockchain {
    /// 새로운 블록체인 생성
    ///
    /// 제네시스 블록으로 초기화됩니다.
    ///
    /// # 예제
    /// ```
    /// use blockchain_core::blockchain::Blockchain;
    ///
    /// let blockchain = Blockchain::new();
    /// assert_eq!(blockchain.len(), 1); // 제네시스 블록
    /// ```
    pub fn new() -> Self {
        log::info!("새로운 블록체인 초기화");

        let mut blockchain = Blockchain {
            chain: vec![],
            difficulty: 4, // 기본 난이도
            pending_transactions: TransactionPool::new(1000), // 최대 1000개
            mining_reward: 50,
            balances: HashMap::new(),
        };

        // 제네시스 블록 생성
        let mut genesis = Block::genesis();
        genesis.difficulty = blockchain.difficulty;
        blockchain.chain.push(genesis);

        blockchain
    }

    /// 마지막 블록 가져오기
    pub fn get_latest_block(&self) -> &Block {
        self.chain.last().expect("블록체인이 비어있음")
    }

    /// 새로운 트랜잭션 추가 (풀에)
    ///
    /// # 예제
    /// ```
    /// use blockchain_core::blockchain::Blockchain;
    /// use blockchain_core::transaction::Transaction;
    ///
    /// let mut blockchain = Blockchain::new();
    /// let tx = Transaction::new(
    ///     "alice".to_string(),
    ///     "bob".to_string(),
    ///     10,
    ///     1,
    /// );
    ///
    /// let result = blockchain.add_transaction(tx);
    /// assert!(result.is_ok());
    /// ```
    pub fn add_transaction(&mut self, transaction: Transaction) -> Result<(), String> {
        // 코인베이스가 아닌 경우 잔액 확인
        if transaction.from != "COINBASE" {
            let balance = self.get_balance(&transaction.from);
            let total_cost = transaction.total_cost();

            if balance < total_cost {
                return Err(format!(
                    "잔액 부족: {} < {} (필요)",
                    balance, total_cost
                ));
            }
        }

        // 트랜잭션 풀에 추가
        self.pending_transactions.add_transaction(transaction)
    }

    /// 새로운 블록 채굴
    ///
    /// # 설명
    /// 1. 대기 중인 트랜잭션들을 가져옴
    /// 2. 채굴 보상 트랜잭션 추가
    /// 3. 새 블록 생성 및 채굴
    /// 4. 블록체인에 추가
    ///
    /// # 인자
    /// - `mining_reward_address`: 채굴 보상을 받을 주소
    ///
    /// # 예제
    /// ```no_run
    /// use blockchain_core::blockchain::Blockchain;
    ///
    /// let mut blockchain = Blockchain::new();
    /// blockchain.mine_pending_transactions("miner_address".to_string());
    /// assert_eq!(blockchain.len(), 2); // 제네시스 + 새 블록
    /// ```
    pub fn mine_pending_transactions(&mut self, mining_reward_address: String) {
        log::info!(
            "블록 채굴 시작... (대기 중인 트랜잭션: {})",
            self.pending_transactions.len()
        );

        // 트랜잭션 가져오기 (최대 100개)
        let mut transactions = self.pending_transactions.get_transactions(100);

        // 채굴 보상 트랜잭션 추가
        let reward_tx = Transaction::coinbase(mining_reward_address.clone(), self.mining_reward);
        transactions.insert(0, reward_tx);

        // 새 블록 생성
        let previous_hash = self.get_latest_block().hash.clone();
        let index = self.chain.len() as u64;

        let mut new_block = Block::new(index, transactions.clone(), previous_hash);
        new_block.difficulty = self.difficulty;

        // 작업 증명 (채굴)
        new_block.mine();

        // 블록을 체인에 추가
        self.chain.push(new_block.clone());

        // 잔액 업데이트
        self.update_balances(&transactions);

        log::info!("블록 #{} 체인에 추가됨", index);
    }

    /// 특정 주소의 잔액 조회
    ///
    /// # 예제
    /// ```
    /// use blockchain_core::blockchain::Blockchain;
    ///
    /// let blockchain = Blockchain::new();
    /// let balance = blockchain.get_balance("alice");
    /// assert_eq!(balance, 0);
    /// ```
    pub fn get_balance(&self, address: &str) -> u64 {
        *self.balances.get(address).unwrap_or(&0)
    }

    /// 잔액 업데이트 (트랜잭션 적용)
    fn update_balances(&mut self, transactions: &[Transaction]) {
        for tx in transactions {
            // 보내는 사람 잔액 감소
            if tx.from != "COINBASE" {
                let from_balance = self.get_balance(&tx.from);
                let new_balance = from_balance.saturating_sub(tx.total_cost());
                self.balances.insert(tx.from.clone(), new_balance);

                log::debug!(
                    "{} 잔액: {} -> {}",
                    &tx.from,
                    from_balance,
                    new_balance
                );
            }

            // 받는 사람 잔액 증가
            let to_balance = self.get_balance(&tx.to);
            let new_balance = to_balance + tx.amount;
            self.balances.insert(tx.to.clone(), new_balance);

            log::debug!("{} 잔액: {} -> {}", &tx.to, to_balance, new_balance);
        }
    }

    /// 블록체인 유효성 검증
    ///
    /// # 검증 항목
    /// 1. 제네시스 블록이 올바른지
    /// 2. 각 블록이 유효한지
    /// 3. 블록들이 올바르게 연결되어 있는지 (이전 해시 검증)
    ///
    /// # 반환값
    /// - `true`: 블록체인이 유효함
    /// - `false`: 블록체인이 무효함 (변조됨)
    pub fn is_valid(&self) -> bool {
        // 1. 제네시스 블록 검증
        if self.chain.is_empty() {
            log::error!("블록체인이 비어있음");
            return false;
        }

        let genesis = &self.chain[0];
        if genesis.index != 0 || genesis.previous_hash != "0" {
            log::error!("제네시스 블록이 유효하지 않음");
            return false;
        }

        // 2. 각 블록 검증
        for i in 1..self.chain.len() {
            let current_block = &self.chain[i];
            let previous_block = &self.chain[i - 1];

            // 블록 자체가 유효한지
            if !current_block.is_valid() {
                log::error!("블록 #{} 유효하지 않음", i);
                return false;
            }

            // 이전 블록과 올바르게 연결되었는지
            if current_block.previous_hash != previous_block.hash {
                log::error!(
                    "블록 #{} 연결 끊김: expected {}, got {}",
                    i,
                    previous_block.hash,
                    current_block.previous_hash
                );
                return false;
            }

            // 인덱스가 순차적인지
            if current_block.index != previous_block.index + 1 {
                log::error!("블록 #{} 인덱스 불일치", i);
                return false;
            }
        }

        log::info!("블록체인 검증 성공");
        true
    }

    /// 블록체인 길이
    pub fn len(&self) -> usize {
        self.chain.len()
    }

    /// 블록체인이 비어있는지
    pub fn is_empty(&self) -> bool {
        self.chain.is_empty()
    }

    /// 특정 블록 가져오기
    pub fn get_block(&self, index: u64) -> Option<&Block> {
        self.chain.get(index as usize)
    }

    /// 특정 트랜잭션 찾기
    pub fn find_transaction(&self, tx_id: &str) -> Option<(&Block, &Transaction)> {
        for block in &self.chain {
            for tx in &block.transactions {
                if tx.id == tx_id {
                    return Some((block, tx));
                }
            }
        }
        None
    }

    /// 특정 주소의 거래 내역 조회
    pub fn get_transaction_history(&self, address: &str) -> Vec<&Transaction> {
        let mut history = Vec::new();

        for block in &self.chain {
            for tx in &block.transactions {
                if tx.from == address || tx.to == address {
                    history.push(tx);
                }
            }
        }

        history
    }

    /// 난이도 조정
    ///
    /// # 설명
    /// 비트코인처럼 일정 블록마다 난이도를 자동 조정합니다.
    /// 블록 생성 시간이 목표보다 빠르면 난이도 증가,
    /// 느리면 난이도 감소
    ///
    /// # 인자
    /// - `target_time_seconds`: 목표 블록 생성 시간 (초)
    /// - `adjustment_interval`: 난이도 조정 간격 (블록 수)
    pub fn adjust_difficulty(&mut self, target_time_seconds: i64, adjustment_interval: u64) {
        let current_height = self.len() as u64;

        // 조정 시점이 아니면 리턴
        if current_height % adjustment_interval != 0 {
            return;
        }

        let latest_block = self.get_latest_block();
        let interval_start_block = self
            .get_block(current_height - adjustment_interval)
            .expect("블록을 찾을 수 없음");

        // 실제 소요 시간 계산
        let time_taken = (latest_block.timestamp - interval_start_block.timestamp)
            .num_seconds();

        // 목표 시간
        let target_time = target_time_seconds * adjustment_interval as i64;

        // 난이도 조정
        let old_difficulty = self.difficulty;

        if time_taken < target_time / 2 {
            // 너무 빠름 -> 난이도 증가
            self.difficulty += 1;
            log::info!("난이도 증가: {} -> {}", old_difficulty, self.difficulty);
        } else if time_taken > target_time * 2 {
            // 너무 느림 -> 난이도 감소
            if self.difficulty > 1 {
                self.difficulty -= 1;
                log::info!("난이도 감소: {} -> {}", old_difficulty, self.difficulty);
            }
        }
    }

    /// 블록체인 통계
    pub fn get_stats(&self) -> BlockchainStats {
        let total_transactions: usize = self
            .chain
            .iter()
            .map(|block| block.transaction_count())
            .sum();

        let total_size: usize = self.chain.iter().map(|block| block.size()).sum();

        BlockchainStats {
            total_blocks: self.len(),
            total_transactions,
            total_size_bytes: total_size,
            difficulty: self.difficulty,
            pending_transactions: self.pending_transactions.len(),
        }
    }

    /// 블록체인을 JSON으로 내보내기
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(&self.chain)
    }

    /// JSON에서 블록체인 불러오기
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        let chain: Vec<Block> = serde_json::from_str(json)?;

        let mut blockchain = Blockchain::new();
        blockchain.chain = chain;

        // 잔액 재계산
        blockchain.recalculate_balances();

        Ok(blockchain)
    }

    /// 잔액 재계산 (블록체인에서 복구 시)
    fn recalculate_balances(&mut self) {
        self.balances.clear();

        for block in &self.chain {
            self.update_balances(&block.transactions);
        }
    }
}

/// 블록체인 통계 구조체
#[derive(Debug)]
pub struct BlockchainStats {
    pub total_blocks: usize,
    pub total_transactions: usize,
    pub total_size_bytes: usize,
    pub difficulty: u32,
    pub pending_transactions: usize,
}

impl std::fmt::Display for BlockchainStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "블록체인 통계\n\
             ├─ 총 블록 수: {}\n\
             ├─ 총 트랜잭션: {}\n\
             ├─ 전체 크기: {} bytes ({:.2} KB)\n\
             ├─ 난이도: {}\n\
             └─ 대기 중인 트랜잭션: {}",
            self.total_blocks,
            self.total_transactions,
            self.total_size_bytes,
            self.total_size_bytes as f64 / 1024.0,
            self.difficulty,
            self.pending_transactions
        )
    }
}

// Default 트레이트 구현
impl Default for Blockchain {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_blockchain() {
        let blockchain = Blockchain::new();
        assert_eq!(blockchain.len(), 1); // 제네시스 블록
        assert!(blockchain.is_valid());
    }

    #[test]
    fn test_mine_block() {
        let mut blockchain = Blockchain::new();

        // 트랜잭션 추가
        let tx = Transaction::new(
            "COINBASE".to_string(), // 초기에는 COINBASE에서
            "alice".to_string(),
            100,
            0,
        );
        blockchain.add_transaction(tx).unwrap();

        // 블록 채굴
        blockchain.mine_pending_transactions("miner".to_string());

        assert_eq!(blockchain.len(), 2);
        assert!(blockchain.is_valid());
    }

    #[test]
    fn test_balance() {
        let mut blockchain = Blockchain::new();

        // 채굴 (alice에게 보상)
        blockchain.mine_pending_transactions("alice".to_string());

        let balance = blockchain.get_balance("alice");
        assert_eq!(balance, 50); // 채굴 보상
    }

    #[test]
    fn test_transfer() {
        let mut blockchain = Blockchain::new();

        // alice가 채굴 보상 받음
        blockchain.mine_pending_transactions("alice".to_string());

        // alice -> bob 송금
        let tx = Transaction::new(
            "alice".to_string(),
            "bob".to_string(),
            10,
            1,
        );
        blockchain.add_transaction(tx).unwrap();

        // 블록 채굴
        blockchain.mine_pending_transactions("miner".to_string());

        // 잔액 확인
        let alice_balance = blockchain.get_balance("alice");
        let bob_balance = blockchain.get_balance("bob");

        assert_eq!(alice_balance, 50 - 10 - 1); // 50 - 송금 - 수수료
        assert_eq!(bob_balance, 10);
    }

    #[test]
    fn test_insufficient_balance() {
        let mut blockchain = Blockchain::new();

        // alice는 잔액이 없음
        let tx = Transaction::new(
            "alice".to_string(),
            "bob".to_string(),
            100,
            1,
        );

        let result = blockchain.add_transaction(tx);
        assert!(result.is_err());
    }

    #[test]
    fn test_blockchain_tampering() {
        let mut blockchain = Blockchain::new();

        // 블록 채굴
        blockchain.mine_pending_transactions("miner".to_string());
        blockchain.mine_pending_transactions("miner".to_string());

        assert!(blockchain.is_valid());

        // 블록 변조 시도
        if let Some(block) = blockchain.chain.get_mut(1) {
            block.transactions.clear(); // 거래 삭제
        }

        // 검증 실패해야 함
        assert!(!blockchain.is_valid());
    }

    #[test]
    fn test_find_transaction() {
        let mut blockchain = Blockchain::new();

        let tx = Transaction::new(
            "COINBASE".to_string(),
            "alice".to_string(),
            100,
            0,
        );
        let tx_id = tx.id.clone();

        blockchain.add_transaction(tx).unwrap();
        blockchain.mine_pending_transactions("miner".to_string());

        let found = blockchain.find_transaction(&tx_id);
        assert!(found.is_some());
    }
}
