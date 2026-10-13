#!/usr/bin/env bash
# 디자인: Claude 브리프 → GPT 아트디렉터 검토 → Claude 최종 브리프 + 이미지 생성 프롬프트
# (이미지 자체는 ChatGPT·Gemini 앱에 최종 프롬프트를 붙여넣어 생성)
source "$(dirname "$0")/../lib/common.sh"
usage() { echo '사용법: ./ai.sh design "카페 로고, 따뜻하고 미니멀하게" [-f 브랜드설명.txt]'; }
parse_args design "$@"
P="$(profile)"

brief=$(step 1 claude 브리프 "${P}디자인 요청: $TOPIC
디자인 브리프를 만들어줘.
1. 목적과 타깃, 사용될 곳(크기·매체)
2. 무드 키워드 5개와 피해야 할 느낌
3. 컬러 팔레트 2안 (HEX 코드 포함)
4. 폰트 추천 (한글/영문, 무료 폰트 위주)
5. 레이아웃·구성 아이디어 3안$REF")

review=$(step 2 gpt 검토 "너는 경험 많은 아트디렉터야. 아래 브리프를 보고
흔하거나 진부한 부분, 타깃과 어울리지 않는 선택, 실제 제작 시 문제가 될 부분(가독성, 작은 크기, 인쇄)을 지적하고 개선안을 줘.
[브리프]
$brief")

step 3 claude 최종본 "${P}검토 의견을 반영해 최종 디자인 브리프를 만들어줘. 마지막에 다음을 추가해줘.
- 구성안별 이미지 생성 프롬프트 (영문, ChatGPT·Gemini 이미지 생성에 바로 붙여넣을 수 있게, 비율 명시)
- 같은 프롬프트의 한글 설명
- 캔바/피그마에서 직접 만들 때의 단계별 가이드
[브리프]
$brief
[검토 의견]
$review" >/dev/null

done_msg 3_최종본.md
