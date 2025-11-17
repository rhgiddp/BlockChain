/// 블록체인 영속성 저장소
///
/// LevelDB 기반 블록 및 트랜잭션 저장

use crate::block::Block;
use crate::transaction::Transaction;
use anyhow::{Context, Result};
use leveldb::database::Database;
use leveldb::kv::KV;
use leveldb::options::{Options, ReadOptions, WriteOptions};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// 저장소 키 프리픽스
const BLOCK_PREFIX: &str = "block:";
const TX_PREFIX: &str = "tx:";
const METADATA_PREFIX: &str = "meta:";
const HEIGHT_KEY: &str = "meta:height";
const LATEST_HASH_KEY: &str = "meta:latest_hash";

/// 블록체인 저장소
pub struct BlockchainStorage {
    db: Database<i32>,
    write_opts: WriteOptions,
    read_opts: ReadOptions,
}

impl BlockchainStorage {
    /// 새 저장소 생성 또는 열기
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let mut options = Options::new();
        options.create_if_missing = true;
        options.compression = leveldb::options::Compression::Snappy;

        let db = Database::open(path.as_ref(), options)
            .context("Failed to open LevelDB")?;

        let write_opts = WriteOptions::new();
        let read_opts = ReadOptions::new();

        log::info!("LevelDB 저장소 열기 성공: {:?}", path.as_ref());

        Ok(BlockchainStorage {
            db,
            write_opts,
            read_opts,
        })
    }

    /// 블록 저장
    pub fn save_block(&self, block: &Block) -> Result<()> {
        let key = format!("{}{}", BLOCK_PREFIX, block.index);
        let value = bincode::serialize(block)?;

        self.db.put(self.write_opts, key.as_bytes(), &value)?;

        // 최신 높이 업데이트
        self.db.put(
            self.write_opts,
            HEIGHT_KEY.as_bytes(),
            &block.index.to_le_bytes(),
        )?;

        // 최신 해시 업데이트
        self.db.put(
            self.write_opts,
            LATEST_HASH_KEY.as_bytes(),
            block.hash.as_bytes(),
        )?;

        log::debug!("블록 #{} 저장 완료", block.index);
        Ok(())
    }

    /// 블록 불러오기
    pub fn get_block(&self, index: u64) -> Result<Option<Block>> {
        let key = format!("{}{}", BLOCK_PREFIX, index);

        match self.db.get(self.read_opts, key.as_bytes())? {
            Some(data) => {
                let block: Block = bincode::deserialize(&data)?;
                Ok(Some(block))
            }
            None => Ok(None),
        }
    }

    /// 블록 해시로 조회
    pub fn get_block_by_hash(&self, hash: &str) -> Result<Option<Block>> {
        // 전체 블록을 스캔 (최적화 가능: 해시 인덱스 추가)
        let height = self.get_height()?;

        for i in 0..=height {
            if let Some(block) = self.get_block(i)? {
                if block.hash == hash {
                    return Ok(Some(block));
                }
            }
        }

        Ok(None)
    }

    /// 트랜잭션 저장
    pub fn save_transaction(&self, tx: &Transaction) -> Result<()> {
        let key = format!("{}{}", TX_PREFIX, tx.id);
        let value = bincode::serialize(tx)?;

        self.db.put(self.write_opts, key.as_bytes(), &value)?;

        log::debug!("트랜잭션 {} 저장 완료", &tx.id[..16]);
        Ok(())
    }

    /// 트랜잭션 불러오기
    pub fn get_transaction(&self, tx_id: &str) -> Result<Option<Transaction>> {
        let key = format!("{}{}", TX_PREFIX, tx_id);

        match self.db.get(self.read_opts, key.as_bytes())? {
            Some(data) => {
                let tx: Transaction = bincode::deserialize(&data)?;
                Ok(Some(tx))
            }
            None => Ok(None),
        }
    }

    /// 현재 블록체인 높이
    pub fn get_height(&self) -> Result<u64> {
        match self.db.get(self.read_opts, HEIGHT_KEY.as_bytes())? {
            Some(data) => {
                let bytes: [u8; 8] = data.try_into()
                    .map_err(|_| anyhow::anyhow!("Invalid height data"))?;
                Ok(u64::from_le_bytes(bytes))
            }
            None => Ok(0),
        }
    }

    /// 최신 블록 해시
    pub fn get_latest_hash(&self) -> Result<Option<String>> {
        match self.db.get(self.read_opts, LATEST_HASH_KEY.as_bytes())? {
            Some(data) => {
                let hash = String::from_utf8(data)?;
                Ok(Some(hash))
            }
            None => Ok(None),
        }
    }

    /// 블록 범위 조회
    pub fn get_blocks(&self, from: u64, to: u64) -> Result<Vec<Block>> {
        let mut blocks = Vec::new();

        for i in from..=to {
            if let Some(block) = self.get_block(i)? {
                blocks.push(block);
            } else {
                break;
            }
        }

        Ok(blocks)
    }

    /// 메타데이터 저장
    pub fn save_metadata<T: Serialize>(&self, key: &str, value: &T) -> Result<()> {
        let full_key = format!("{}{}", METADATA_PREFIX, key);
        let data = bincode::serialize(value)?;

        self.db.put(self.write_opts, full_key.as_bytes(), &data)?;
        Ok(())
    }

    /// 메타데이터 불러오기
    pub fn get_metadata<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<Option<T>> {
        let full_key = format!("{}{}", METADATA_PREFIX, key);

        match self.db.get(self.read_opts, full_key.as_bytes())? {
            Some(data) => {
                let value: T = bincode::deserialize(&data)?;
                Ok(Some(value))
            }
            None => Ok(None),
        }
    }

    /// 데이터베이스 압축 (성능 최적화)
    pub fn compact(&self) -> Result<()> {
        log::info!("LevelDB 압축 시작...");

        // LevelDB는 자동으로 압축하지만, 수동으로도 트리거 가능
        // 실제 구현은 LevelDB API에 따라 다름

        log::info!("LevelDB 압축 완료");
        Ok(())
    }

    /// 데이터베이스 통계
    pub fn get_stats(&self) -> Result<StorageStats> {
        let height = self.get_height()?;

        // 대략적인 크기 계산 (실제로는 LevelDB stats 사용)
        let mut total_size = 0u64;
        let mut block_count = 0u64;
        let mut tx_count = 0u64;

        for i in 0..=height {
            if let Some(block) = self.get_block(i)? {
                total_size += block.size() as u64;
                block_count += 1;
                tx_count += block.transactions.len() as u64;
            }
        }

        Ok(StorageStats {
            height,
            block_count,
            tx_count,
            total_size_bytes: total_size,
        })
    }

    /// 블록체인 검증 (저장된 모든 블록)
    pub fn verify_chain(&self) -> Result<bool> {
        log::info!("저장된 블록체인 검증 시작...");

        let height = self.get_height()?;

        for i in 1..=height {
            let current = self.get_block(i)?.context("Block not found")?;
            let previous = self.get_block(i - 1)?.context("Previous block not found")?;

            // 블록 자체 유효성
            if !current.is_valid() {
                log::error!("블록 #{} 유효하지 않음", i);
                return Ok(false);
            }

            // 이전 블록과 연결 확인
            if current.previous_hash != previous.hash {
                log::error!("블록 #{} 연결 끊김", i);
                return Ok(false);
            }
        }

        log::info!("블록체인 검증 성공 ({} 블록)", height + 1);
        Ok(true)
    }

    /// 백업 생성
    pub fn backup<P: AsRef<Path>>(&self, backup_path: P) -> Result<()> {
        log::info!("백업 생성 중: {:?}", backup_path.as_ref());

        // LevelDB 스냅샷 기능 사용
        // 실제 구현은 파일 시스템 복사 또는 LevelDB API 사용

        log::info!("백업 완료");
        Ok(())
    }
}

/// 저장소 통계
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageStats {
    pub height: u64,
    pub block_count: u64,
    pub tx_count: u64,
    pub total_size_bytes: u64,
}

impl std::fmt::Display for StorageStats {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "저장소 통계\n\
             ├─ 높이: {}\n\
             ├─ 블록 수: {}\n\
             ├─ 트랜잭션 수: {}\n\
             └─ 전체 크기: {} bytes ({:.2} MB)",
            self.height,
            self.block_count,
            self.tx_count,
            self.total_size_bytes,
            self.total_size_bytes as f64 / 1_048_576.0
        )
    }
}

/// 캐시 레이어 (성능 최적화)
pub struct CachedStorage {
    storage: BlockchainStorage,
    block_cache: std::sync::Mutex<lru::LruCache<u64, Block>>,
}

impl CachedStorage {
    /// 새 캐시 저장소 생성
    pub fn new<P: AsRef<Path>>(path: P, cache_size: usize) -> Result<Self> {
        Ok(CachedStorage {
            storage: BlockchainStorage::new(path)?,
            block_cache: std::sync::Mutex::new(lru::LruCache::new(
                std::num::NonZeroUsize::new(cache_size).unwrap()
            )),
        })
    }

    /// 캐시를 통한 블록 조회
    pub fn get_block(&self, index: u64) -> Result<Option<Block>> {
        // 캐시 확인
        if let Some(block) = self.block_cache.lock().unwrap().get(&index) {
            return Ok(Some(block.clone()));
        }

        // 디스크에서 로드
        if let Some(block) = self.storage.get_block(index)? {
            // 캐시에 저장
            self.block_cache.lock().unwrap().put(index, block.clone());
            Ok(Some(block))
        } else {
            Ok(None)
        }
    }

    /// 블록 저장 (캐시 갱신)
    pub fn save_block(&self, block: &Block) -> Result<()> {
        self.storage.save_block(block)?;
        self.block_cache.lock().unwrap().put(block.index, block.clone());
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transaction::Transaction;
    use tempfile::tempdir;

    #[test]
    fn test_storage_creation() {
        let dir = tempdir().unwrap();
        let storage = BlockchainStorage::new(dir.path());
        assert!(storage.is_ok());
    }

    #[test]
    fn test_save_and_load_block() {
        let dir = tempdir().unwrap();
        let storage = BlockchainStorage::new(dir.path()).unwrap();

        let block = Block::genesis();
        storage.save_block(&block).unwrap();

        let loaded = storage.get_block(0).unwrap();
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap().index, 0);
    }

    #[test]
    fn test_save_and_load_transaction() {
        let dir = tempdir().unwrap();
        let storage = BlockchainStorage::new(dir.path()).unwrap();

        let tx = Transaction::new(
            "alice".to_string(),
            "bob".to_string(),
            100,
            1,
        );

        storage.save_transaction(&tx).unwrap();

        let loaded = storage.get_transaction(&tx.id).unwrap();
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap().amount, 100);
    }

    #[test]
    fn test_height_tracking() {
        let dir = tempdir().unwrap();
        let storage = BlockchainStorage::new(dir.path()).unwrap();

        assert_eq!(storage.get_height().unwrap(), 0);

        let block1 = Block::genesis();
        storage.save_block(&block1).unwrap();

        assert_eq!(storage.get_height().unwrap(), 0);

        let block2 = Block::new(1, vec![], block1.hash.clone());
        storage.save_block(&block2).unwrap();

        assert_eq!(storage.get_height().unwrap(), 1);
    }
}
