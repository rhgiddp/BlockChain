/// KONET 블록체인 노드 메인 진입점
///
/// 이 프로그램은 블록체인 노드를 실행합니다.

mod block;
mod blockchain;
mod transaction;

use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use blockchain::Blockchain;
use clap::{Parser, Subcommand};
use std::sync::Mutex;
use transaction::Transaction;

/// CLI 인자 구조체
#[derive(Parser)]
#[command(name = "blockchain-node")]
#[command(author = "KONET Team")]
#[command(version = "0.1.0")]
#[command(about = "KONET Blockchain Node", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// 노드 서버 실행
    Start {
        /// HTTP 서버 포트
        #[arg(short, long, default_value = "8080")]
        port: u16,

        /// 호스트 주소
        #[arg(short = 'H', long, default_value = "127.0.0.1")]
        host: String,
    },

    /// 블록 채굴 (CLI 모드)
    Mine {
        /// 채굴 보상을 받을 주소
        #[arg(short, long)]
        address: String,
    },

    /// 블록체인 정보 출력
    Info,

    /// 트랜잭션 생성 (테스트용)
    CreateTx {
        /// 보내는 주소
        #[arg(short, long)]
        from: String,

        /// 받는 주소
        #[arg(short, long)]
        to: String,

        /// 금액
        #[arg(short, long)]
        amount: u64,

        /// 수수료
        #[arg(short = 'f', long, default_value = "1")]
        fee: u64,
    },
}

/// 블록체인 상태 (전역)
struct AppState {
    blockchain: Mutex<Blockchain>,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 로거 초기화
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let cli = Cli::parse();

    match &cli.command {
        Some(Commands::Start { port, host }) => {
            // 서버 모드
            start_server(host, *port).await
        }
        Some(Commands::Mine { address }) => {
            // CLI 채굴 모드
            cli_mine(address);
            Ok(())
        }
        Some(Commands::Info) => {
            // 블록체인 정보
            cli_info();
            Ok(())
        }
        Some(Commands::CreateTx {
            from,
            to,
            amount,
            fee,
        }) => {
            // 트랜잭션 생성
            cli_create_tx(from, to, *amount, *fee);
            Ok(())
        }
        None => {
            // 기본: 서버 모드
            start_server("127.0.0.1", 8080).await
        }
    }
}

/// 서버 시작
async fn start_server(host: &str, port: u16) -> std::io::Result<()> {
    log::info!("🚀 KONET 블록체인 노드 시작");
    log::info!("📡 서버 주소: http://{}:{}", host, port);

    // 블록체인 초기화
    let blockchain = Blockchain::new();

    // 공유 상태
    let app_state = web::Data::new(AppState {
        blockchain: Mutex::new(blockchain),
    });

    // HTTP 서버 시작
    HttpServer::new(move || {
        App::new()
            .app_data(app_state.clone())
            // API 라우트
            .route("/", web::get().to(index))
            .route("/api/blocks", web::get().to(get_blocks))
            .route("/api/blocks/{index}", web::get().to(get_block))
            .route("/api/mine", web::post().to(mine_block))
            .route("/api/transactions", web::post().to(add_transaction))
            .route("/api/balance/{address}", web::get().to(get_balance))
            .route("/api/stats", web::get().to(get_stats))
            .route("/api/validate", web::get().to(validate_chain))
    })
    .bind((host, port))?
    .run()
    .await
}

// ==================== API 핸들러 ====================

/// 루트 경로
async fn index() -> impl Responder {
    HttpResponse::Ok().json(serde_json::json!({
        "name": "KONET Blockchain",
        "version": "0.1.0",
        "status": "running",
        "endpoints": [
            "GET /api/blocks - 전체 블록 조회",
            "GET /api/blocks/{index} - 특정 블록 조회",
            "POST /api/mine - 블록 채굴",
            "POST /api/transactions - 트랜잭션 추가",
            "GET /api/balance/{address} - 잔액 조회",
            "GET /api/stats - 블록체인 통계",
            "GET /api/validate - 블록체인 검증",
        ]
    }))
}

/// 전체 블록 조회
async fn get_blocks(data: web::Data<AppState>) -> impl Responder {
    let blockchain = data.blockchain.lock().unwrap();
    HttpResponse::Ok().json(&blockchain.chain)
}

/// 특정 블록 조회
async fn get_block(path: web::Path<u64>, data: web::Data<AppState>) -> impl Responder {
    let index = path.into_inner();
    let blockchain = data.blockchain.lock().unwrap();

    match blockchain.get_block(index) {
        Some(block) => HttpResponse::Ok().json(block),
        None => HttpResponse::NotFound().json(serde_json::json!({
            "error": "블록을 찾을 수 없습니다"
        })),
    }
}

/// 블록 채굴 요청
#[derive(serde::Deserialize)]
struct MineRequest {
    reward_address: String,
}

async fn mine_block(
    req: web::Json<MineRequest>,
    data: web::Data<AppState>,
) -> impl Responder {
    let mut blockchain = data.blockchain.lock().unwrap();

    log::info!("블록 채굴 요청: {}", req.reward_address);

    // 채굴
    blockchain.mine_pending_transactions(req.reward_address.clone());

    let latest_block = blockchain.get_latest_block();

    HttpResponse::Ok().json(serde_json::json!({
        "message": "블록 채굴 성공",
        "block": latest_block
    }))
}

/// 트랜잭션 추가 요청
#[derive(serde::Deserialize)]
struct TransactionRequest {
    from: String,
    to: String,
    amount: u64,
    fee: u64,
}

async fn add_transaction(
    req: web::Json<TransactionRequest>,
    data: web::Data<AppState>,
) -> impl Responder {
    let mut blockchain = data.blockchain.lock().unwrap();

    let transaction = Transaction::new(
        req.from.clone(),
        req.to.clone(),
        req.amount,
        req.fee,
    );

    match blockchain.add_transaction(transaction.clone()) {
        Ok(_) => {
            log::info!("트랜잭션 추가 성공: {}", &transaction.id[..16]);
            HttpResponse::Ok().json(serde_json::json!({
                "message": "트랜잭션 추가 성공",
                "transaction_id": transaction.id
            }))
        }
        Err(e) => {
            log::warn!("트랜잭션 추가 실패: {}", e);
            HttpResponse::BadRequest().json(serde_json::json!({
                "error": e
            }))
        }
    }
}

/// 잔액 조회
async fn get_balance(path: web::Path<String>, data: web::Data<AppState>) -> impl Responder {
    let address = path.into_inner();
    let blockchain = data.blockchain.lock().unwrap();

    let balance = blockchain.get_balance(&address);

    HttpResponse::Ok().json(serde_json::json!({
        "address": address,
        "balance": balance
    }))
}

/// 블록체인 통계
async fn get_stats(data: web::Data<AppState>) -> impl Responder {
    let blockchain = data.blockchain.lock().unwrap();
    let stats = blockchain.get_stats();

    HttpResponse::Ok().json(serde_json::json!({
        "total_blocks": stats.total_blocks,
        "total_transactions": stats.total_transactions,
        "total_size_bytes": stats.total_size_bytes,
        "difficulty": stats.difficulty,
        "pending_transactions": stats.pending_transactions
    }))
}

/// 블록체인 검증
async fn validate_chain(data: web::Data<AppState>) -> impl Responder {
    let blockchain = data.blockchain.lock().unwrap();
    let is_valid = blockchain.is_valid();

    HttpResponse::Ok().json(serde_json::json!({
        "valid": is_valid,
        "message": if is_valid {
            "블록체인이 유효합니다"
        } else {
            "블록체인이 손상되었습니다"
        }
    }))
}

// ==================== CLI 명령어 ====================

/// CLI: 블록 채굴
fn cli_mine(address: &str) {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    log::info!("블록 채굴 시작...");

    let mut blockchain = Blockchain::new();

    // 테스트 트랜잭션 추가
    let tx = Transaction::new(
        "COINBASE".to_string(),
        address.to_string(),
        100,
        0,
    );
    blockchain.add_transaction(tx).unwrap();

    // 채굴
    blockchain.mine_pending_transactions(address.to_string());

    log::info!("채굴 완료!");
    log::info!("블록 수: {}", blockchain.len());
    log::info!("{} 잔액: {}", address, blockchain.get_balance(address));
}

/// CLI: 블록체인 정보
fn cli_info() {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let blockchain = Blockchain::new();
    let stats = blockchain.get_stats();

    println!("\n{}", "=".repeat(50));
    println!("KONET 블록체인 정보");
    println!("{}", "=".repeat(50));
    println!("{}", stats);
    println!("{}", "=".repeat(50));
    println!("\n최근 블록:");

    for (i, block) in blockchain.chain.iter().rev().take(5).enumerate() {
        println!("\n{}. {}", i + 1, block);
    }
}

/// CLI: 트랜잭션 생성
fn cli_create_tx(from: &str, to: &str, amount: u64, fee: u64) {
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));

    let mut blockchain = Blockchain::new();

    // 테스트를 위해 from 주소에 잔액 부여
    blockchain.mine_pending_transactions(from.to_string());

    // 트랜잭션 생성
    let tx = Transaction::new(
        from.to_string(),
        to.to_string(),
        amount,
        fee,
    );

    println!("\n{}", "=".repeat(50));
    println!("트랜잭션 생성");
    println!("{}", "=".repeat(50));
    println!("{}", tx);
    println!("{}", "=".repeat(50));

    match blockchain.add_transaction(tx) {
        Ok(_) => println!("\n✅ 트랜잭션 풀에 추가됨"),
        Err(e) => println!("\n❌ 실패: {}", e),
    }
}
