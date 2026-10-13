#!/usr/bin/env bash
# 공통 함수: 세 AI CLI 호출, 대체 실행, 결과 저장

set -euo pipefail

# 명령어 이름은 환경변수로 바꿀 수 있음
CLAUDE_CMD="${CLAUDE_CMD:-claude}"
GPT_CMD="${GPT_CMD:-codex}"
# Gemini: 개인 구독은 Antigravity CLI(agy)로 이전됨. 없으면 예전 gemini CLI 사용
if [[ -z "${GEMINI_CMD:-}" ]]; then
  if command -v agy >/dev/null 2>&1; then GEMINI_CMD=agy; else GEMINI_CMD=gemini; fi
fi

# DRY_RUN=1 이면 실제 AI를 부르지 않고 흐름만 점검
DRY_RUN="${DRY_RUN:-0}"

log() { printf '\033[1;36m▶ %s\033[0m\n' "$*" >&2; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

has() { command -v "$1" >/dev/null 2>&1; }

_call_claude() { "$CLAUDE_CMD" -p "$1"; }
_call_gemini() { "$GEMINI_CMD" -p "$1"; }  # agy, gemini 모두 -p 로 한 번 실행
_call_gpt() {
  local out
  out="$(mktemp)"
  # codex exec 는 진행 로그를 많이 출력하므로 마지막 답변만 파일로 받음
  "$GPT_CMD" exec --skip-git-repo-check --output-last-message "$out" "$1" >/dev/null
  cat "$out"
  rm -f "$out"
}

_cmd_of() {
  case "$1" in
    claude) echo "$CLAUDE_CMD" ;;
    gpt) echo "$GPT_CMD" ;;
    gemini) echo "$GEMINI_CMD" ;;
  esac
}

# 사용법: ask <claude|gpt|gemini> "프롬프트"
# 원하는 AI가 없거나 빈 답을 내면 설치된 다른 AI로 대신 실행
ask() {
  local want="$1" prompt="$2" who out tried=" "
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[DRY_RUN %s 응답]\n프롬프트 앞부분: %s\n' "$want" "${prompt:0:120}"
    return
  fi
  for who in "$want" claude gpt gemini; do
    [[ "$tried" == *" $who "* ]] && continue
    tried+="$who "
    has "$(_cmd_of "$who")" || continue
    [[ "$who" != "$want" ]] && warn "$want 대신 $who 로 실행합니다"
    if out="$("_call_$who" "$prompt")" && [[ -n "${out//[[:space:]]/}" ]]; then
      printf '%s\n' "$out"
      return
    fi
    warn "$who 실행이 실패했거나 빈 답을 냈습니다"
  done
  die "답을 받은 AI가 없습니다. ./ai.sh check 와 각 도구 로그인을 확인하세요."
}

# 사용법: step 번호 AI 파일이름 "프롬프트"  → 결과를 $OUT_DIR 에 저장하고 내용을 반환
step() {
  local n="$1" who="$2" name="$3" prompt="$4" file
  file="$OUT_DIR/${n}_${name}.md"
  log "[$n] $who → $name"
  ask "$who" "$prompt" > "$file"
  cat "$file"
}

# 공통 인자 처리: 주제 + 선택적 참고 파일(-f)
# 결과: TOPIC, REF(참고자료 텍스트), OUT_DIR
parse_args() {
  local pipeline="$1"; shift
  local files=()
  TOPIC=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--file) [[ $# -ge 2 ]] || die "-f 뒤에 파일 경로가 필요합니다"; files+=("$2"); shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) TOPIC="${TOPIC:+$TOPIC }$1"; shift ;;
    esac
  done
  [[ -n "$TOPIC" ]] || { usage; exit 1; }

  REF=""
  local f
  for f in "${files[@]}"; do
    [[ -f "$f" ]] || die "파일이 없습니다: $f"
    REF+=$'\n\n'"[참고자료: $(basename "$f")]"$'\n'"$(cat "$f")"
  done

  local root slug
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  slug="$(printf '%s' "$TOPIC" | tr -s ' /' '__' | cut -c1-40)"
  OUT_DIR="$root/output/$(date +%Y%m%d_%H%M%S)_${pipeline}_${slug}"
  mkdir -p "$OUT_DIR"
  printf '%s\n' "$TOPIC" > "$OUT_DIR/0_주제.txt"
}

# 내 정보(profile.md)를 모든 프롬프트 앞에 붙임
profile() {
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [[ -f "$root/profile.md" ]]; then
    printf '[나에 대한 정보]\n%s\n\n' "$(cat "$root/profile.md")"
  fi
}

done_msg() {
  log "완료! 결과 폴더: $OUT_DIR"
  log "최종본: $OUT_DIR/$1"
}
