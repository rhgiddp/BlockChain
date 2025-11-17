# KONET 성능 최적화 모듈 Makefile
# C로 작성된 고성능 암호화 함수

CC = gcc
AR = ar
CFLAGS = -Wall -Wextra -O3 -march=native -fPIC -pthread
INCLUDES = -Iinclude
LDFLAGS = -shared

# 디렉토리
SRC_DIR = src
INC_DIR = include
OBJ_DIR = obj
LIB_DIR = lib
TEST_DIR = tests

# 소스 파일
SOURCES = $(wildcard $(SRC_DIR)/*.c)
OBJECTS = $(SOURCES:$(SRC_DIR)/%.c=$(OBJ_DIR)/%.o)

# 라이브러리
STATIC_LIB = $(LIB_DIR)/libkonet_crypto.a
SHARED_LIB = $(LIB_DIR)/libkonet_crypto.so

# 테스트
TEST_SOURCES = $(wildcard $(TEST_DIR)/*.c)
TEST_BINS = $(TEST_SOURCES:$(TEST_DIR)/%.c=$(TEST_DIR)/%)

.PHONY: all clean test install

all: $(STATIC_LIB) $(SHARED_LIB)

# 디렉토리 생성
$(OBJ_DIR):
	mkdir -p $(OBJ_DIR)

$(LIB_DIR):
	mkdir -p $(LIB_DIR)

# 오브젝트 파일 생성
$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c | $(OBJ_DIR)
	$(CC) $(CFLAGS) $(INCLUDES) -c $< -o $@

# 정적 라이브러리
$(STATIC_LIB): $(OBJECTS) | $(LIB_DIR)
	$(AR) rcs $@ $(OBJECTS)
	@echo "정적 라이브러리 생성: $@"

# 공유 라이브러리
$(SHARED_LIB): $(OBJECTS) | $(LIB_DIR)
	$(CC) $(LDFLAGS) -o $@ $(OBJECTS) -pthread
	@echo "공유 라이브러리 생성: $@"

# 테스트 빌드
test: $(TEST_BINS)
	@for test in $(TEST_BINS); do \
		echo "실행: $$test"; \
		$$test; \
	done

$(TEST_DIR)/%: $(TEST_DIR)/%.c $(STATIC_LIB)
	$(CC) $(CFLAGS) $(INCLUDES) $< -o $@ -L$(LIB_DIR) -lkonet_crypto -pthread

# 설치
install: $(STATIC_LIB) $(SHARED_LIB)
	@echo "라이브러리 설치 중..."
	sudo cp $(STATIC_LIB) /usr/local/lib/
	sudo cp $(SHARED_LIB) /usr/local/lib/
	sudo cp $(INC_DIR)/*.h /usr/local/include/
	sudo ldconfig
	@echo "설치 완료!"

# 청소
clean:
	rm -rf $(OBJ_DIR) $(LIB_DIR) $(TEST_BINS)
	@echo "빌드 파일 삭제 완료"

# 벤치마크
benchmark: $(TEST_DIR)/benchmark
	$(TEST_DIR)/benchmark

# 도움말
help:
	@echo "KONET 성능 모듈 빌드 시스템"
	@echo ""
	@echo "사용법:"
	@echo "  make         - 모든 라이브러리 빌드"
	@echo "  make test    - 테스트 실행"
	@echo "  make install - 시스템에 설치"
	@echo "  make clean   - 빌드 파일 삭제"
	@echo "  make benchmark - 성능 측정"
	@echo "  make help    - 이 도움말 표시"
