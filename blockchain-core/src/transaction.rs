/// 트랜잭션 (거래) 구조 정의
///
/// 블록체인에서 발생하는 모든 거래를 표현합니다.

use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// 트랜잭션 구조체
///
/// # 필드 설명
/// - `id`: 트랜잭션 고유 ID (해시)
/// - `from`: 보내는 사람의 주소 (공개키)
/// - `to`: 받는 사람의 주소
/// - `amount`: 송금액
/// - `fee`: 거래 수수료
/// - `timestamp`: 거래 생성 시간
/// - `signature`: 디지털 서명 (보내는 사람이 서명)
/// - `data`: 추가 데이터 (스마트 컨트랙트 호출 등)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: String,
    pub from: String,
    pub to: String,
    pub amount: u64,
    pub fee: u64,
    pub timestamp: DateTime<Utc>,
    pub signature: Option<String>,
    pub data: Option<Vec<u8>>,
}

impl Transaction {
    /// 새로운 트랜잭션 생성
    ///
    /// # 예제
    /// ```
    /// use blockchain_core::transaction::Transaction;
    ///
    /// let tx = Transaction::new(
    ///     "alice".to_string(),
    ///     "bob".to_string(),
    ///     100,
    ///     1,
    /// );
    /// assert_eq!(tx.amount, 100);
    /// ```
    pub fn new(from: String, to: String, amount: u64, fee: u64) -> Self {
        let timestamp = Utc::now();
        let mut tx = Transaction {
            id: String::new(),
            from,
            to,
            amount,
            fee,
            timestamp,
            signature: None,
            data: None,
        };

        // ID 계산 (해시)
        tx.id = tx.calculate_hash();
        tx
    }

    /// 코인베이스 트랜잭션 생성 (채굴 보상)
    ///
    /// # 설명
    /// 코인베이스 트랜잭션은 채굴자에게 보상을 주는 특별한 거래입니다.
    /// from 주소가 "COINBASE"이며, 서명이 필요 없습니다.
    ///
    /// # 예제
    /// ```
    /// use blockchain_core::transaction::Transaction;
    ///
    /// let coinbase = Transaction::coinbase("miner_address".to_string(), 50);
    /// assert_eq!(coinbase.from, "COINBASE");
    /// ```
    pub fn coinbase(to: String, amount: u64) -> Self {
        Transaction::new(String::from("COINBASE"), to, amount, 0)
    }

    /// 트랜잭션 해시 계산
    ///
    /// SHA-256을 사용하여 거래의 고유 ID를 생성합니다.
    pub fn calculate_hash(&self) -> String {
        let data_hex = self
            .data
            .as_ref()
            .map(|d| hex::encode(d))
            .unwrap_or_default();

        let content = format!(
            "{}{}{}{}{}{}",
            self.from,
            self.to,
            self.amount,
            self.fee,
            self.timestamp.to_rfc3339(),
            data_hex
        );

        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// 트랜잭션에 서명하기
    ///
    /// # 설명
    /// 보내는 사람의 개인키로 트랜잭션에 서명합니다.
    /// 이는 거래가 실제로 소유자에 의해 승인되었음을 증명합니다.
    ///
    /// # 인자
    /// - `signing_key`: 보내는 사람의 개인키
    ///
    /// # 예제
    /// ```no_run
    /// use blockchain_core::transaction::Transaction;
    /// use ed25519_dalek::SigningKey;
    /// use rand::rngs::OsRng;
    ///
    /// let mut csprng = OsRng;
    /// let signing_key = SigningKey::generate(&mut csprng);
    ///
    /// let mut tx = Transaction::new(
    ///     "alice".to_string(),
    ///     "bob".to_string(),
    ///     100,
    ///     1,
    /// );
    /// tx.sign(&signing_key);
    /// assert!(tx.signature.is_some());
    /// ```
    pub fn sign(&mut self, signing_key: &SigningKey) {
        // 코인베이스 거래는 서명 불필요
        if self.from == "COINBASE" {
            return;
        }

        let message = self.calculate_hash();
        let signature = signing_key.sign(message.as_bytes());

        self.signature = Some(hex::encode(signature.to_bytes()));
        log::debug!("트랜잭션 서명 완료: {}", &self.id[..16]);
    }

    /// 트랜잭션 서명 검증
    ///
    /// # 설명
    /// 서명이 유효한지 확인합니다.
    /// 공개키로 서명을 검증하여 거래가 위조되지 않았는지 확인합니다.
    ///
    /// # 인자
    /// - `verifying_key`: 보내는 사람의 공개키
    ///
    /// # 반환값
    /// - `true`: 서명이 유효함
    /// - `false`: 서명이 무효함
    pub fn verify_signature(&self, verifying_key: &VerifyingKey) -> bool {
        // 코인베이스 거래는 검증 불필요
        if self.from == "COINBASE" {
            return true;
        }

        let Some(sig_hex) = &self.signature else {
            log::warn!("서명이 없는 트랜잭션: {}", &self.id[..16]);
            return false;
        };

        let Ok(sig_bytes) = hex::decode(sig_hex) else {
            log::warn!("잘못된 서명 형식: {}", &self.id[..16]);
            return false;
        };

        let Ok(signature) = Signature::from_slice(&sig_bytes) else {
            log::warn!("서명 파싱 실패: {}", &self.id[..16]);
            return false;
        };

        let message = self.calculate_hash();
        verifying_key.verify(message.as_bytes(), &signature).is_ok()
    }

    /// 트랜잭션 유효성 검증
    ///
    /// # 검증 항목
    /// 1. amount가 0보다 큰지
    /// 2. from과 to가 다른지 (자기 자신에게 송금 불가)
    /// 3. 서명이 있는지 (코인베이스 제외)
    ///
    /// # 반환값
    /// - `true`: 트랜잭션이 유효함
    /// - `false`: 트랜잭션이 무효함
    pub fn is_valid(&self) -> bool {
        // 1. 금액 검증
        if self.amount == 0 {
            log::warn!("트랜잭션 {}: 금액이 0", &self.id[..16]);
            return false;
        }

        // 2. 송수신자 검증
        if self.from == self.to && self.from != "COINBASE" {
            log::warn!("트랜잭션 {}: 자기 자신에게 송금 불가", &self.id[..16]);
            return false;
        }

        // 3. 서명 검증 (코인베이스 제외)
        if self.from != "COINBASE" && self.signature.is_none() {
            log::warn!("트랜잭션 {}: 서명 없음", &self.id[..16]);
            return false;
        }

        // 4. ID 검증
        if self.id != self.calculate_hash() {
            log::warn!("트랜잭션 {}: ID 불일치", &self.id[..16]);
            return false;
        }

        true
    }

    /// 트랜잭션 크기 (바이트)
    pub fn size(&self) -> usize {
        bincode::serialize(self).unwrap_or_default().len()
    }

    /// 트랜잭션 총 비용 (amount + fee)
    pub fn total_cost(&self) -> u64 {
        self.amount + self.fee
    }
}

// Display 트레이트 구현
impl std::fmt::Display for Transaction {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "TX {}\n  From: {}\n  To: {}\n  Amount: {} (Fee: {})\n  Time: {}",
            &self.id[..16],
            if self.from.len() > 16 {
                &self.from[..16]
            } else {
                &self.from
            },
            if self.to.len() > 16 {
                &self.to[..16]
            } else {
                &self.to
            },
            self.amount,
            self.fee,
            self.timestamp.format("%Y-%m-%d %H:%M:%S")
        )
    }
}

/// 트랜잭션 풀
///
/// 아직 블록에 포함되지 않은 대기 중인 트랜잭션들을 관리합니다.
pub struct TransactionPool {
    transactions: Vec<Transaction>,
    max_size: usize,
}

impl TransactionPool {
    /// 새로운 트랜잭션 풀 생성
    pub fn new(max_size: usize) -> Self {
        TransactionPool {
            transactions: Vec::new(),
            max_size,
        }
    }

    /// 트랜잭션 추가
    ///
    /// # 반환값
    /// - `Ok(())`: 추가 성공
    /// - `Err`: 추가 실패 (풀이 가득 참, 무효한 거래 등)
    pub fn add_transaction(&mut self, tx: Transaction) -> Result<(), String> {
        // 유효성 검증
        if !tx.is_valid() {
            return Err("무효한 트랜잭션".to_string());
        }

        // 중복 확인
        if self.transactions.iter().any(|t| t.id == tx.id) {
            return Err("이미 존재하는 트랜잭션".to_string());
        }

        // 풀 크기 확인
        if self.transactions.len() >= self.max_size {
            return Err("트랜잭션 풀이 가득 참".to_string());
        }

        log::info!("트랜잭션 풀에 추가: {}", &tx.id[..16]);
        self.transactions.push(tx);
        Ok(())
    }

    /// 수수료가 높은 순으로 트랜잭션 가져오기
    ///
    /// # 인자
    /// - `count`: 가져올 트랜잭션 수
    ///
    /// # 반환값
    /// 수수료가 높은 순으로 정렬된 트랜잭션 목록
    pub fn get_transactions(&mut self, count: usize) -> Vec<Transaction> {
        // 수수료 높은 순 정렬
        self.transactions.sort_by(|a, b| b.fee.cmp(&a.fee));

        // 요청한 개수만큼 가져오고 풀에서 제거
        let result: Vec<Transaction> = self
            .transactions
            .drain(..count.min(self.transactions.len()))
            .collect();

        log::info!("트랜잭션 풀에서 {} 개 가져옴", result.len());
        result
    }

    /// 풀에 있는 트랜잭션 수
    pub fn len(&self) -> usize {
        self.transactions.len()
    }

    /// 풀이 비어있는지
    pub fn is_empty(&self) -> bool {
        self.transactions.is_empty()
    }

    /// 특정 트랜잭션 제거
    pub fn remove_transaction(&mut self, tx_id: &str) {
        self.transactions.retain(|tx| tx.id != tx_id);
    }

    /// 풀 비우기
    pub fn clear(&mut self) {
        self.transactions.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::OsRng;

    #[test]
    fn test_create_transaction() {
        let tx = Transaction::new(
            "alice".to_string(),
            "bob".to_string(),
            100,
            1,
        );
        assert_eq!(tx.amount, 100);
        assert_eq!(tx.fee, 1);
        assert!(!tx.id.is_empty());
    }

    #[test]
    fn test_coinbase_transaction() {
        let tx = Transaction::coinbase("miner".to_string(), 50);
        assert_eq!(tx.from, "COINBASE");
        assert_eq!(tx.amount, 50);
        assert!(tx.is_valid());
    }

    #[test]
    fn test_sign_and_verify() {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();

        let mut tx = Transaction::new(
            "alice".to_string(),
            "bob".to_string(),
            100,
            1,
        );

        tx.sign(&signing_key);
        assert!(tx.signature.is_some());
        assert!(tx.verify_signature(&verifying_key));
    }

    #[test]
    fn test_transaction_pool() {
        let mut pool = TransactionPool::new(10);

        let tx1 = Transaction::new("alice".to_string(), "bob".to_string(), 100, 1);
        let tx2 = Transaction::new("bob".to_string(), "charlie".to_string(), 50, 2);

        assert!(pool.add_transaction(tx1.clone()).is_ok());
        assert!(pool.add_transaction(tx2.clone()).is_ok());
        assert_eq!(pool.len(), 2);

        // 중복 추가 시도
        assert!(pool.add_transaction(tx1).is_err());

        // 수수료 높은 순으로 가져오기
        let txs = pool.get_transactions(1);
        assert_eq!(txs[0].fee, 2); // tx2가 먼저
    }

    #[test]
    fn test_invalid_transaction() {
        let mut tx = Transaction::new(
            "alice".to_string(),
            "alice".to_string(), // 자기 자신에게 송금
            100,
            1,
        );
        assert!(!tx.is_valid());

        tx.amount = 0; // 금액 0
        assert!(!tx.is_valid());
    }
}
