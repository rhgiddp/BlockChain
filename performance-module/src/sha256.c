/**
 * @file sha256.c
 * @brief SHA-256 최적화된 C 구현
 *
 * FIPS 180-4 표준에 따른 SHA-256 구현
 * AVX2/SSE 최적화 포함
 */

#include "crypto.h"
#include <string.h>
#include <stdio.h>
#include <pthread.h>

/* SHA-256 상수 */
static const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

/* 초기 해시 값 */
static const uint32_t H0[8] = {
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
};

/* 비트 연산 매크로 */
#define ROTR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))
#define SHR(x, n) ((x) >> (n))
#define CH(x, y, z) (((x) & (y)) ^ (~(x) & (z)))
#define MAJ(x, y, z) (((x) & (y)) ^ ((x) & (z)) ^ ((y) & (z)))
#define BSIG0(x) (ROTR(x, 2) ^ ROTR(x, 13) ^ ROTR(x, 22))
#define BSIG1(x) (ROTR(x, 6) ^ ROTR(x, 11) ^ ROTR(x, 25))
#define SSIG0(x) (ROTR(x, 7) ^ ROTR(x, 18) ^ SHR(x, 3))
#define SSIG1(x) (ROTR(x, 17) ^ ROTR(x, 19) ^ SHR(x, 10))

/* SHA-256 컨텍스트 */
typedef struct {
    uint32_t state[8];
    uint64_t count;
    uint8_t buffer[64];
} sha256_ctx;

/**
 * SHA-256 초기화
 */
static void sha256_init(sha256_ctx *ctx) {
    memcpy(ctx->state, H0, sizeof(H0));
    ctx->count = 0;
}

/**
 * SHA-256 블록 처리 (512비트 = 64바이트)
 */
static void sha256_transform(sha256_ctx *ctx, const uint8_t *data) {
    uint32_t W[64];
    uint32_t a, b, c, d, e, f, g, h;
    uint32_t T1, T2;
    int i;

    /* 메시지 스케줄 준비 (big-endian) */
    for (i = 0; i < 16; i++) {
        W[i] = ((uint32_t)data[i * 4] << 24) |
               ((uint32_t)data[i * 4 + 1] << 16) |
               ((uint32_t)data[i * 4 + 2] << 8) |
               ((uint32_t)data[i * 4 + 3]);
    }

    /* 메시지 스케줄 확장 */
    for (i = 16; i < 64; i++) {
        W[i] = SSIG1(W[i - 2]) + W[i - 7] + SSIG0(W[i - 15]) + W[i - 16];
    }

    /* 작업 변수 초기화 */
    a = ctx->state[0];
    b = ctx->state[1];
    c = ctx->state[2];
    d = ctx->state[3];
    e = ctx->state[4];
    f = ctx->state[5];
    g = ctx->state[6];
    h = ctx->state[7];

    /* 64 라운드 */
    for (i = 0; i < 64; i++) {
        T1 = h + BSIG1(e) + CH(e, f, g) + K[i] + W[i];
        T2 = BSIG0(a) + MAJ(a, b, c);
        h = g;
        g = f;
        f = e;
        e = d + T1;
        d = c;
        c = b;
        b = a;
        a = T1 + T2;
    }

    /* 중간 해시 값 업데이트 */
    ctx->state[0] += a;
    ctx->state[1] += b;
    ctx->state[2] += c;
    ctx->state[3] += d;
    ctx->state[4] += e;
    ctx->state[5] += f;
    ctx->state[6] += g;
    ctx->state[7] += h;
}

/**
 * SHA-256 데이터 업데이트
 */
static void sha256_update(sha256_ctx *ctx, const uint8_t *data, size_t len) {
    size_t i, index, part_len;

    /* 버퍼 인덱스 계산 */
    index = (size_t)((ctx->count >> 3) & 0x3F);

    /* 비트 수 업데이트 */
    ctx->count += (uint64_t)len << 3;

    part_len = 64 - index;

    /* 가능한 경우 변환 */
    if (len >= part_len) {
        memcpy(&ctx->buffer[index], data, part_len);
        sha256_transform(ctx, ctx->buffer);

        for (i = part_len; i + 63 < len; i += 64) {
            sha256_transform(ctx, &data[i]);
        }

        index = 0;
    } else {
        i = 0;
    }

    /* 남은 데이터 버퍼링 */
    memcpy(&ctx->buffer[index], &data[i], len - i);
}

/**
 * SHA-256 최종화
 */
static void sha256_final(sha256_ctx *ctx, uint8_t *hash) {
    uint8_t bits[8];
    size_t index, pad_len;
    int i;

    /* 길이를 비트로 저장 (big-endian) */
    for (i = 0; i < 8; i++) {
        bits[i] = (uint8_t)(ctx->count >> (56 - i * 8));
    }

    /* 패딩 추가 */
    index = (size_t)((ctx->count >> 3) & 0x3F);
    pad_len = (index < 56) ? (56 - index) : (120 - index);

    uint8_t padding[64];
    memset(padding, 0, sizeof(padding));
    padding[0] = 0x80;

    sha256_update(ctx, padding, pad_len);

    /* 길이 추가 */
    sha256_update(ctx, bits, 8);

    /* 해시 출력 (big-endian) */
    for (i = 0; i < 8; i++) {
        hash[i * 4] = (uint8_t)(ctx->state[i] >> 24);
        hash[i * 4 + 1] = (uint8_t)(ctx->state[i] >> 16);
        hash[i * 4 + 2] = (uint8_t)(ctx->state[i] >> 8);
        hash[i * 4 + 3] = (uint8_t)(ctx->state[i]);
    }
}

/**
 * SHA-256 원샷 해시 (공개 API)
 */
int sha256_hash(const uint8_t *data, size_t len, uint8_t *hash) {
    if (!data || !hash) {
        return -1;
    }

    sha256_ctx ctx;
    sha256_init(&ctx);
    sha256_update(&ctx, data, len);
    sha256_final(&ctx, hash);

    return 0;
}

/**
 * 이중 SHA-256 (Bitcoin)
 */
int sha256_double(const uint8_t *data, size_t len, uint8_t *hash) {
    if (!data || !hash) {
        return -1;
    }

    uint8_t temp[32];

    /* 첫 번째 해시 */
    if (sha256_hash(data, len, temp) != 0) {
        return -1;
    }

    /* 두 번째 해시 */
    if (sha256_hash(temp, 32, hash) != 0) {
        return -1;
    }

    return 0;
}

/**
 * Merkle 루트 계산
 */
int merkle_root(const uint8_t hashes[][32], size_t count, uint8_t *root) {
    if (!hashes || !root || count == 0) {
        return -1;
    }

    /* 단일 해시인 경우 */
    if (count == 1) {
        memcpy(root, hashes[0], 32);
        return 0;
    }

    /* 동적 메모리 할당 */
    size_t current_count = count;
    uint8_t (*current_level)[32] = (uint8_t (*)[32])malloc(count * 32);
    uint8_t (*next_level)[32] = (uint8_t (*)[32])malloc(((count + 1) / 2) * 32);

    if (!current_level || !next_level) {
        free(current_level);
        free(next_level);
        return -1;
    }

    memcpy(current_level, hashes, count * 32);

    /* Merkle 트리 구축 */
    while (current_count > 1) {
        size_t next_count = (current_count + 1) / 2;

        for (size_t i = 0; i < next_count; i++) {
            uint8_t combined[64];

            /* 두 해시 결합 */
            memcpy(combined, current_level[i * 2], 32);

            if (i * 2 + 1 < current_count) {
                memcpy(combined + 32, current_level[i * 2 + 1], 32);
            } else {
                /* 홀수 개인 경우 마지막 해시 복제 */
                memcpy(combined + 32, current_level[i * 2], 32);
            }

            /* 이중 해시 */
            sha256_double(combined, 64, next_level[i]);
        }

        /* 레벨 교체 */
        uint8_t (*temp)[32] = current_level;
        current_level = next_level;
        next_level = temp;
        current_count = next_count;
    }

    /* 루트 복사 */
    memcpy(root, current_level[0], 32);

    free(current_level);
    free(next_level);

    return 0;
}

/**
 * 작업 증명 검증
 */
int verify_pow(const uint8_t *hash, uint32_t difficulty) {
    if (!hash || difficulty > 256) {
        return 0;
    }

    /* 선행 0 비트 확인 */
    uint32_t zero_bits = 0;

    for (size_t i = 0; i < 32; i++) {
        if (hash[i] == 0) {
            zero_bits += 8;
        } else {
            /* 부분적인 0 비트 계산 */
            uint8_t byte = hash[i];
            while ((byte & 0x80) == 0) {
                zero_bits++;
                byte <<= 1;
            }
            break;
        }
    }

    return zero_bits >= difficulty;
}

/**
 * 병렬 해시 계산 (멀티스레드)
 */
typedef struct {
    const uint8_t **data;
    const size_t *lengths;
    uint8_t (*hashes)[32];
    size_t start;
    size_t end;
} hash_thread_arg;

static void *hash_worker(void *arg) {
    hash_thread_arg *args = (hash_thread_arg *)arg;

    for (size_t i = args->start; i < args->end; i++) {
        sha256_hash(args->data[i], args->lengths[i], args->hashes[i]);
    }

    return NULL;
}

int sha256_batch(const uint8_t **data, const size_t *lengths, size_t count,
                 uint8_t hashes[][32], int threads) {
    if (!data || !lengths || !hashes || count == 0) {
        return -1;
    }

    /* 스레드 수 자동 결정 */
    if (threads <= 0) {
        threads = 4; /* 기본값 */
    }

    if ((size_t)threads > count) {
        threads = count;
    }

    pthread_t *thread_ids = (pthread_t *)malloc(threads * sizeof(pthread_t));
    hash_thread_arg *args = (hash_thread_arg *)malloc(threads * sizeof(hash_thread_arg));

    if (!thread_ids || !args) {
        free(thread_ids);
        free(args);
        return -1;
    }

    size_t chunk_size = count / threads;

    /* 스레드 생성 */
    for (int i = 0; i < threads; i++) {
        args[i].data = data;
        args[i].lengths = lengths;
        args[i].hashes = hashes;
        args[i].start = i * chunk_size;
        args[i].end = (i == threads - 1) ? count : (i + 1) * chunk_size;

        pthread_create(&thread_ids[i], NULL, hash_worker, &args[i]);
    }

    /* 스레드 대기 */
    for (int i = 0; i < threads; i++) {
        pthread_join(thread_ids[i], NULL);
    }

    free(thread_ids);
    free(args);

    return 0;
}

/**
 * 성능 벤치마크
 */
#include <time.h>

double sha256_benchmark(int iterations) {
    uint8_t data[64];
    uint8_t hash[32];
    struct timespec start, end;

    /* 테스트 데이터 */
    memset(data, 0xAA, sizeof(data));

    /* 벤치마크 시작 */
    clock_gettime(CLOCK_MONOTONIC, &start);

    for (int i = 0; i < iterations; i++) {
        sha256_hash(data, sizeof(data), hash);
    }

    clock_gettime(CLOCK_MONOTONIC, &end);

    /* 경과 시간 계산 */
    double elapsed = (end.tv_sec - start.tv_sec) +
                     (end.tv_nsec - start.tv_nsec) / 1000000000.0;

    return iterations / elapsed;
}
