#!/usr/bin/env bash
# 사업기획: Gemini 시장조사 → Claude 기획서 → GPT 투자자 관점 반박 → Claude 최종본
source "$(dirname "$0")/../lib/common.sh"
usage() { echo '사용법: ./ai.sh business "사업 아이디어" [-f 메모.txt]'; }
parse_args business "$@"
P="$(profile)"

research=$(step 1 gemini 시장조사 "${P}사업 아이디어: $TOPIC
다음을 조사해 정리해줘 (가능하면 출처와 수치 포함).
1. 시장 규모와 성장 추세
2. 주요 경쟁사와 각자의 가격·강점·약점
3. 타깃 고객과 그들이 겪는 문제
4. 관련 규제나 진입 장벽$REF")

plan=$(step 2 claude 기획서 "${P}사업 아이디어: $TOPIC
아래 시장조사를 바탕으로 사업기획서를 써줘.
목차: 한 줄 요약 / 문제와 고객 / 해결책 / 경쟁 우위 / 수익 모델 / 초기 비용과 손익 추정(가정 명시) / 마케팅 전략 / 90일 실행 계획 / 리스크
[시장조사]
$research$REF")

critique=$(step 3 gpt 반박 "너는 냉정한 투자 심사역이야. 아래 사업기획서에 투자하지 않을 이유를 최대한 날카롭게 찾아줘.
숫자 가정의 허점, 경쟁 대응, 실행 리스크를 구체적으로 짚고, 각 문제마다 보완 방법도 제안해줘.
[기획서]
$plan")

step 4 claude 최종본 "${P}반박 의견을 반영해 기획서를 보완한 최종본을 써줘.
마지막에 '반박 대응표 (지적 | 대응)'와 '이번 주에 바로 할 일 5가지'를 추가해줘.
[기획서]
$plan
[반박 의견]
$critique" >/dev/null

done_msg 4_최종본.md
