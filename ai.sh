#!/usr/bin/env bash
# 진입점: ./ai.sh <작업종류> "주제" [-f 참고파일]
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

list() {
  cat <<'USAGE'
사용법: ai <작업종류> "주제" [-f 참고파일] [-i 사진 또는 사진폴더 ...]

작업종류:
  youtube   유튜브 영상 대본·편집계획·제목·썸네일
  insta     인스타 릴스 기획·컷 구성·캡션·해시태그
  business  사업기획서 (시장조사 → 기획 → 반박 → 보완)
  travel    여행 일정표 (현지정보 → 일정 → 점검 → 최종)
  design    디자인 브리프 + 이미지 생성 프롬프트
  meeting   AI 부서 회의실 (미래기획실·운영팀·자료관리팀 토론 → 결론 → 자료 정리)
  check     설치된 AI 도구 확인
  notion    노션 자동 저장 설정 (처음 한 번)
  update    최신 버전으로 업데이트

예시:
  ai youtube "제주 2박3일 브이로그" -f 촬영본_자막.txt
  ai business "티셔츠 사업성 분석" -i ~/Desktop/티셔츠사진
  ai meeting "다음 4주 릴스 기획" --rounds 2
  DRY_RUN=1 ai travel "오사카 3박4일"   # AI 호출 없이 흐름만 점검
USAGE
}

[[ $# -ge 1 ]] || { list; exit 1; }
kind="$1"; shift

case "$kind" in
  check)
    for c in claude codex; do
      if command -v "$c" >/dev/null; then echo "✔ $c"; else echo "✖ $c (설치 필요)"; fi
    done
    if command -v agy >/dev/null; then echo "✔ agy (Gemini)"
    elif command -v gemini >/dev/null; then echo "△ gemini (개인 구독은 막힘, agy 설치 권장)"
    else echo "✖ agy (Gemini, 설치 필요)"; fi ;;
  meeting) exec node "$DIR/meeting/server.mjs" "$@" ;;
  notion) exec node "$DIR/lib/notion.mjs" setup ;;
  update)
    # git clone 으로 설치한 경우만 가능. 개인 파일(profile.md, notion.env, output)은 건드리지 않음
    if [[ ! -d "$DIR/.git" ]]; then
      echo "ZIP으로 받은 폴더는 자동 업데이트가 안 됩니다. README의 '설치'대로 한 번만 다시 설치해 주세요."
      exit 1
    fi
    git -C "$DIR" pull --ff-only origin main && echo "✔ 최신 버전입니다" ;;
  youtube|insta|business|travel|design) exec bash "$DIR/pipelines/$kind.sh" "$@" ;;
  -h|--help|help) list ;;
  *) echo "알 수 없는 작업종류: $kind"; list; exit 1 ;;
esac
