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

# 사진(-i)이 있으면 Claude는 파일 읽기 도구로, Codex는 --image 로 직접 봄
IMAGES=()
_call_claude() {
  if [[ ${#IMAGES[@]} -gt 0 ]]; then
    # --allowedTools, --add-dir 는 뒤의 값을 여러 개 받으므로 프롬프트를 먼저 씀
    "$CLAUDE_CMD" -p "$1" --allowedTools Read --add-dir "$OUT_DIR"
  else
    "$CLAUDE_CMD" -p "$1"
  fi
}
_call_gemini() { "$GEMINI_CMD" -p "$1"; }  # agy, gemini 모두 -p 로 한 번 실행
_call_gpt() {
  local out
  out="$(mktemp)"
  # codex exec 는 진행 로그를 많이 출력하므로 마지막 답변만 파일로 받음
  local img args=()
  for img in ${IMAGES[@]+"${IMAGES[@]}"}; do args+=("--image=$img"); done
  # 프롬프트를 사진 옵션보다 먼저 써야 사진 경로로 잘못 읽히지 않음
  "$GPT_CMD" exec --skip-git-repo-check --output-last-message "$out" "$1" ${args[@]+"${args[@]}"} >/dev/null
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
  local files=() images=()
  PIPELINE="$pipeline"
  TOPIC=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--file) [[ $# -ge 2 ]] || die "-f 뒤에 파일 경로가 필요합니다"; files+=("$2"); shift 2 ;;
      -i|--image)
        # -i 뒤에 사진 여러 장이나 폴더를 이어서 쓸 수 있음
        shift
        [[ $# -gt 0 ]] || die "-i 뒤에 사진 파일이나 폴더가 필요합니다"
        while [[ $# -gt 0 ]] && { [[ -d "$1" ]] || is_image "$1"; }; do images+=("$1"); shift; done
        ;;
      -h|--help) usage; exit 0 ;;
      *) TOPIC="${TOPIC:+$TOPIC }$1"; shift ;;
    esac
  done
  [[ -n "$TOPIC" ]] || { usage; exit 1; }

  REF=""
  local f
  for f in ${files[@]+"${files[@]}"}; do
    [[ -f "$f" ]] || die "파일이 없습니다: $f"
    REF+=$'\n\n'"[참고자료: $(basename "$f")]"$'\n'"$(cat "$f")"
  done

  local root slug
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  slug="$(printf '%s' "$TOPIC" | tr -s ' /' '__')"
  slug="${slug:0:40}"
  OUT_DIR="$root/output/$(date +%Y%m%d_%H%M%S)_${pipeline}_${slug}"
  mkdir -p "$OUT_DIR"
  printf '%s\n' "$TOPIC" > "$OUT_DIR/0_주제.txt"

  for f in ${images[@]+"${images[@]}"}; do add_image "$f"; done
  [[ ${#IMAGES[@]} -gt 0 ]] && describe_images
  return 0
}

is_image() { [[ -f "$1" ]] && [[ "$(printf '%s' "$1" | tr 'A-Z' 'a-z')" =~ \.(jpe?g|png|webp|gif|heic)$ ]]; }

# 사진을 결과 폴더로 복사. Mac이면 HEIC → JPG 변환하고 긴 변을 1600px로 줄임
add_image() {
  local src="$1" f dest
  if [[ -d "$src" ]]; then
    for f in "$src"/*; do is_image "$f" && add_image "$f"; done
    return 0
  fi
  is_image "$src" || die "사진 파일이 아닙니다: $src"
  mkdir -p "$OUT_DIR/사진"
  dest="$OUT_DIR/사진/$(( ${#IMAGES[@]} + 1 ))_$(basename "${src%.*}").jpg"
  if has sips; then
    sips -s format jpeg -Z 1600 "$src" --out "$dest" >/dev/null 2>&1 || cp "$src" "$dest"
  else
    dest="${dest%.jpg}.${src##*.}"
    cp "$src" "$dest"
  fi
  IMAGES+=("$dest")
}

# Claude가 사진을 직접 보고 글로 정리 → 모든 AI가 참고자료로 받음
describe_images() {
  local list="" img desc
  for img in "${IMAGES[@]}"; do list+="- $img"$'\n'; done
  log "사진 ${#IMAGES[@]}장을 Claude가 직접 보고 정리합니다"
  desc=$(step 0 claude 사진분석 "아래 사진 파일들을 Read 도구로 하나씩 직접 열어서 보고, 주제와 관련된 내용을 자세히 정리해줘.
주제: $TOPIC
$list
정리할 것: 사진마다 보이는 것(제품, 디자인, 색상, 글자, 분위기, 사람·장소), 품질이나 완성도에서 눈에 띄는 점, 주제와 관련해 중요한 관찰.
사진에 없는 내용은 추측하지 말고, 추측이 필요하면 '추정'이라고 표시해줘.")
  REF+=$'\n\n'"[첨부 사진 분석 (Claude가 사진 ${#IMAGES[@]}장을 직접 보고 정리)]"$'\n'"$desc"
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
  # 노션 설정(./ai.sh notion)을 했으면 최종본을 노션에도 저장
  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  if [[ "$DRY_RUN" != "1" && ( -f "$root/notion.env" || -n "${NOTION_TOKEN:-}" ) ]] && has node; then
    node "$root/lib/notion.mjs" upload "$PIPELINE" "$OUT_DIR" "$OUT_DIR/$1" || true
  fi
}
