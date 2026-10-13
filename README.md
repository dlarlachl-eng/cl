# 세 AI 엮어 쓰기 (Claude · ChatGPT · Gemini)

구독 중인 세 AI를 터미널 도구(CLI)로 연결해, 한 줄 명령으로 **조사 → 작성 → 검토 → 최종본**을 자동으로 돌립니다.
구독 계정으로 로그인해서 쓰기 때문에 API 요금이 따로 나가지 않습니다 (각 플랜의 사용량 한도 안에서).

```bash
./ai.sh youtube "제주 2박3일 브이로그"
```

## 역할 분담

| 작업 | 1단계 | 2단계 | 3단계 | 4단계 |
|---|---|---|---|---|
| `youtube` 유튜브 | Gemini 자료조사 | Claude 대본·편집계획 | GPT 시청자 관점 검토 | Claude 최종본 + 제목·썸네일·태그 |
| `insta` 릴스 | Claude 기획·컷 구성 | GPT 후킹·트렌드 검토 | Claude 최종본 + 캡션·해시태그 | |
| `business` 사업기획 | Gemini 시장조사 | Claude 기획서 | GPT 투자심사역 반박 | Claude 보완 최종본 |
| `travel` 여행 | Gemini 현지정보 | Claude 일정표 | GPT 현실성 점검 | Claude 최종본 + 체크리스트 |
| `design` 디자인 | Claude 브리프 | GPT 아트디렉터 검토 | Claude 최종본 + 이미지 생성 프롬프트 | |

- **Gemini**: 최신 정보 검색과 조사
- **Claude**: 긴 글 작성과 구조화
- **GPT**: 다른 시각에서 비판하고 검토

## 설치 (처음 한 번)

1. [Node.js](https://nodejs.org) 설치 (LTS 버전)
2. 세 도구 설치
   ```bash
   npm install -g @anthropic-ai/claude-code   # Claude Code
   npm install -g @openai/codex               # Codex CLI (ChatGPT)
   curl -fsSL https://antigravity.google/cli/install.sh | bash   # Antigravity CLI (Gemini)
   ```
   > Gemini CLI(`gemini`)는 2026년 6월 18일부터 개인 구독(Google AI Pro/Ultra) 로그인을 받지 않습니다.
   > 대신 Antigravity CLI(`agy`)를 설치하세요. `agy`가 있으면 자동으로 그쪽을 씁니다.
3. 각각 한 번씩 실행해서 **구독 계정으로 로그인**
   ```bash
   claude    # Claude 계정으로 로그인
   codex     # "Sign in with ChatGPT" 선택
   agy       # 브라우저에서 구글 계정으로 로그인
   ```
4. 이 폴더에서 설치 확인
   ```bash
   ./ai.sh check
   ```

> 설치 명령이나 로그인 방식은 바뀔 수 있습니다. 문제가 생기면 각 공식 문서를 확인하세요.
> 세 개 중 하나가 없어도 동작합니다. 없는 AI의 단계는 설치된 다른 AI가 대신 처리합니다.

Windows 사용자는 **WSL** 또는 **Git Bash**에서 실행하세요.

## 사용법

```bash
./ai.sh youtube  "아이폰 17 3주 사용 후기"
./ai.sh insta    "홈카페 라떼아트 3단계"
./ai.sh business "반려견 수제간식 구독 서비스"
./ai.sh travel   "도쿄 3박4일, 11월, 2인, 예산 150만원, 맛집 위주"
./ai.sh design   "카페 로고, 따뜻하고 미니멀하게"
```

### 참고 파일 넣기 (`-f`)
여러 개를 넣을 수 있습니다.

```bash
# 촬영본 자막을 넣으면 잘라낼 부분과 순서 변경을 타임코드로 제안
./ai.sh youtube "제주 브이로그" -f 촬영본_자막.txt

# 항공·숙소 정보를 넣으면 그 일정에 맞춰 계획
./ai.sh travel "오사카 3박4일" -f 항공숙소.txt
```

**영상 편집 팁**: 프리미어 프로나 캡컷의 자동 자막 기능으로 촬영본 자막(.srt 또는 .txt)을 뽑아 `-f`로 넣으세요. 그러면 AI가 실제 촬영 내용을 보고 컷 편집 계획을 짭니다.

### 내 정보 등록 (추천)
`profile.example.md`를 `profile.md`로 복사하고 내 채널, 톤, 쓰는 도구를 적어 두세요. 모든 요청 앞에 자동으로 붙어서, 매번 내 상황을 설명할 필요가 없습니다.

```bash
cp profile.example.md profile.md
```

## 결과물

`output/날짜_작업_주제/` 폴더에 단계별 결과가 저장됩니다.

```
output/20261013_150602_youtube_제주_브이로그/
├── 0_주제.txt
├── 1_조사.md          ← Gemini
├── 2_대본_편집계획.md  ← Claude
├── 3_검토.md          ← GPT
└── 4_최종본.md        ← 이것만 보면 됨
```

중간 결과도 남아 있어서, 어느 AI가 무엇을 바꿨는지 비교할 수 있습니다.

## 알아둘 점

- **AI가 직접 영상을 편집하거나 이미지를 만들지는 않습니다.** 대본, 편집 계획표, 이미지 생성 프롬프트까지 만들어 주고, 실제 편집과 이미지 생성은 편집 프로그램이나 ChatGPT·Gemini 앱에서 하세요.
- 여행 정보(영업시간, 가격)와 시장 수치는 틀릴 수 있으니 최종본의 "확인할 것" 목록을 꼭 확인하세요.
- 한 번 실행할 때 AI를 3~4번 호출합니다. 구독 플랜의 사용량 한도를 참고하세요.
- `DRY_RUN=1 ./ai.sh travel "테스트"` 로 실행하면 AI를 부르지 않고 흐름만 점검합니다.

## 나만의 작업 추가하기

`pipelines/` 폴더의 파일 하나를 복사해서 프롬프트만 바꾸면 됩니다. 각 단계는 이렇게 생겼습니다.

```bash
결과=$(step 번호 담당AI 파일이름 "프롬프트")   # 담당AI: claude | gpt | gemini
```

그다음 `ai.sh`의 `case` 줄에 새 작업 이름을 추가하세요.
