/// P2P 네트워크 모듈
///
/// libp2p 기반 실제 노드 간 통신 구현

use libp2p::{
    core::{upgrade, transport::MemoryTransport},
    floodsub::{Floodsub, FloodsubEvent, Topic},
    identity,
    mdns::{Mdns, MdnsEvent},
    mplex,
    noise,
    swarm::{NetworkBehaviour, Swarm, SwarmBuilder, SwarmEvent},
    tcp::TokioTcpConfig,
    NetworkBehaviour, PeerId, Transport,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tokio::sync::mpsc;

use crate::block::Block;
use crate::transaction::Transaction;

/// P2P 메시지 타입
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum P2PMessage {
    NewBlock(Block),
    NewTransaction(Transaction),
    GetBlocks { from_index: u64 },
    Blocks(Vec<Block>),
    Ping,
    Pong,
}

/// P2P 네트워크 동작 정의
#[derive(NetworkBehaviour)]
#[behaviour(out_event = "P2PEvent")]
pub struct P2PBehaviour {
    pub floodsub: Floodsub,
    pub mdns: Mdns,
}

#[derive(Debug)]
pub enum P2PEvent {
    Floodsub(FloodsubEvent),
    Mdns(MdnsEvent),
}

impl From<FloodsubEvent> for P2PEvent {
    fn from(event: FloodsubEvent) -> Self {
        P2PEvent::Floodsub(event)
    }
}

impl From<MdnsEvent> for P2PEvent {
    fn from(event: MdnsEvent) -> Self {
        P2PEvent::Mdns(event)
    }
}

/// P2P 네트워크 노드
pub struct P2PNode {
    pub swarm: Swarm<P2PBehaviour>,
    pub peers: HashSet<PeerId>,
    pub topic: Topic,
}

impl P2PNode {
    /// 새로운 P2P 노드 생성
    pub async fn new(port: u16) -> anyhow::Result<Self> {
        log::info!("P2P 노드 초기화 중... (포트: {})", port);

        // 키 페어 생성
        let local_key = identity::Keypair::generate_ed25519();
        let local_peer_id = PeerId::from(local_key.public());
        log::info!("로컬 Peer ID: {}", local_peer_id);

        // 전송 계층 설정
        let transport = TokioTcpConfig::new()
            .upgrade(upgrade::Version::V1)
            .authenticate(noise::NoiseConfig::xx(local_key.clone()).into_authenticated())
            .multiplex(mplex::MplexConfig::new())
            .boxed();

        // Floodsub (메시지 전파)
        let mut floodsub = Floodsub::new(local_peer_id);
        let topic = Topic::new("konet-blockchain");
        floodsub.subscribe(topic.clone());

        // mDNS (로컬 피어 발견)
        let mdns = Mdns::new(Default::default()).await?;

        // 네트워크 동작 결합
        let behaviour = P2PBehaviour { floodsub, mdns };

        // Swarm 생성
        let mut swarm = SwarmBuilder::new(transport, behaviour, local_peer_id)
            .executor(Box::new(|fut| {
                tokio::spawn(fut);
            }))
            .build();

        // 리스닝 주소 설정
        swarm.listen_on(format!("/ip4/0.0.0.0/tcp/{}", port).parse()?)?;

        Ok(P2PNode {
            swarm,
            peers: HashSet::new(),
            topic,
        })
    }

    /// 메시지 브로드캐스트
    pub fn broadcast(&mut self, message: P2PMessage) -> anyhow::Result<()> {
        let data = serde_json::to_vec(&message)?;
        self.swarm.behaviour_mut().floodsub.publish(self.topic.clone(), data);
        log::debug!("메시지 브로드캐스트: {:?}", message);
        Ok(())
    }

    /// 새 블록 브로드캐스트
    pub fn broadcast_block(&mut self, block: Block) -> anyhow::Result<()> {
        log::info!("블록 #{} 브로드캐스트", block.index);
        self.broadcast(P2PMessage::NewBlock(block))
    }

    /// 새 트랜잭션 브로드캐스트
    pub fn broadcast_transaction(&mut self, tx: Transaction) -> anyhow::Result<()> {
        log::debug!("트랜잭션 브로드캐스트: {}", &tx.id[..16]);
        self.broadcast(P2PMessage::NewTransaction(tx))
    }

    /// 블록 동기화 요청
    pub fn request_blocks(&mut self, from_index: u64) -> anyhow::Result<()> {
        log::info!("블록 동기화 요청: 인덱스 {} 부터", from_index);
        self.broadcast(P2PMessage::GetBlocks { from_index })
    }

    /// 이벤트 처리
    pub async fn handle_event(
        &mut self,
        event: SwarmEvent<P2PEvent, std::io::Error>,
        tx: &mpsc::UnboundedSender<P2PMessage>,
    ) {
        match event {
            SwarmEvent::NewListenAddr { address, .. } => {
                log::info!("리스닝: {}", address);
            }
            SwarmEvent::Behaviour(P2PEvent::Mdns(MdnsEvent::Discovered(list))) => {
                for (peer, _) in list {
                    log::info!("피어 발견: {}", peer);
                    self.swarm.behaviour_mut().floodsub.add_node_to_partial_view(peer);
                    self.peers.insert(peer);
                }
            }
            SwarmEvent::Behaviour(P2PEvent::Mdns(MdnsEvent::Expired(list))) => {
                for (peer, _) in list {
                    log::info!("피어 만료: {}", peer);
                    self.swarm.behaviour_mut().floodsub.remove_node_from_partial_view(&peer);
                    self.peers.remove(&peer);
                }
            }
            SwarmEvent::Behaviour(P2PEvent::Floodsub(FloodsubEvent::Message(msg))) => {
                if let Ok(message) = serde_json::from_slice::<P2PMessage>(&msg.data) {
                    log::debug!("메시지 수신: {:?}", message);
                    let _ = tx.send(message);
                }
            }
            SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                log::info!("연결 성립: {}", peer_id);
                self.peers.insert(peer_id);
            }
            SwarmEvent::ConnectionClosed { peer_id, .. } => {
                log::info!("연결 종료: {}", peer_id);
                self.peers.remove(&peer_id);
            }
            _ => {}
        }
    }

    /// 연결된 피어 수
    pub fn peer_count(&self) -> usize {
        self.peers.len()
    }

    /// 피어 목록
    pub fn get_peers(&self) -> Vec<PeerId> {
        self.peers.iter().cloned().collect()
    }
}

/// P2P 네트워크 관리자
pub struct P2PManager {
    node: P2PNode,
    message_rx: mpsc::UnboundedReceiver<P2PMessage>,
    message_tx: mpsc::UnboundedSender<P2PMessage>,
}

impl P2PManager {
    /// 새 P2P 관리자 생성
    pub async fn new(port: u16) -> anyhow::Result<Self> {
        let node = P2PNode::new(port).await?;
        let (tx, rx) = mpsc::unbounded_channel();

        Ok(P2PManager {
            node,
            message_rx: rx,
            message_tx: tx,
        })
    }

    /// P2P 네트워크 실행
    pub async fn run(mut self) -> anyhow::Result<()> {
        log::info!("P2P 네트워크 시작");

        loop {
            tokio::select! {
                event = self.node.swarm.select_next_some() => {
                    self.node.handle_event(event, &self.message_tx).await;
                }
                Some(message) = self.message_rx.recv() => {
                    self.handle_message(message).await;
                }
            }
        }
    }

    /// 메시지 처리
    async fn handle_message(&mut self, message: P2PMessage) {
        match message {
            P2PMessage::NewBlock(block) => {
                log::info!("새 블록 수신: #{}", block.index);
                // 블록체인에 추가 로직
            }
            P2PMessage::NewTransaction(tx) => {
                log::info!("새 트랜잭션 수신: {}", &tx.id[..16]);
                // 트랜잭션 풀에 추가 로직
            }
            P2PMessage::GetBlocks { from_index } => {
                log::info!("블록 요청 수신: {} 부터", from_index);
                // 블록 전송 로직
            }
            P2PMessage::Blocks(blocks) => {
                log::info!("블록 수신: {} 개", blocks.len());
                // 블록 동기화 로직
            }
            P2PMessage::Ping => {
                let _ = self.node.broadcast(P2PMessage::Pong);
            }
            P2PMessage::Pong => {
                log::debug!("Pong 수신");
            }
        }
    }

    /// 피어 통계
    pub fn get_stats(&self) -> NetworkStats {
        NetworkStats {
            peer_count: self.node.peer_count(),
            peers: self.node.get_peers(),
        }
    }
}

/// 네트워크 통계
#[derive(Debug, Clone)]
pub struct NetworkStats {
    pub peer_count: usize,
    pub peers: Vec<PeerId>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_p2p_node_creation() {
        let node = P2PNode::new(9000).await;
        assert!(node.is_ok());
    }

    #[tokio::test]
    async fn test_message_serialization() {
        let msg = P2PMessage::Ping;
        let serialized = serde_json::to_vec(&msg).unwrap();
        let deserialized: P2PMessage = serde_json::from_slice(&serialized).unwrap();

        match deserialized {
            P2PMessage::Ping => assert!(true),
            _ => assert!(false),
        }
    }
}
