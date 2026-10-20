# 세 AI 엮어 쓰기 (Claude · ChatGPT · Gemini)

구독 중인 세 AI를 터미널 도구(CLI)로 연결해, 한 줄 명령으로 **조사 → 작성 → 검토 → 최종본**을 자동으로 돌립니다.
구독 계정으로 로그인해서 쓰기 때문에 API 요금이 따로 나가지 않습니다 (각 플랜의 사용량 한도 안에서).

```bash
ai youtube "제주 2박3일 브이로그"
```

## 역할 분담

| 작업 | 1단계 | 2단계 | 3단계 | 4단계 |
|---|---|---|---|---|
| `youtube` 유튜브 | Gemini 자료조사 | Claude 대본·편집계획 | GPT 시청자 관점 검토 | Claude 최종본 + 제목·썸네일·태그 |
| `insta` 릴스 | Claude 기획·컷 구성 | GPT 후킹·트렌드 검토 | Claude 최종본 + 캡션·해시태그 | |
| `business` 사업기획 | Gemini 시장조사 | Claude 기획서 | GPT 투자심사역 반박 | Claude 보완 최종본 |
| `travel` 여행 | Gemini 현지정보 | Claude 일정표 | GPT 현실성 점검 | Claude 최종본 + 체크리스트 |
| `design` 디자인 | Claude 브리프 | GPT 아트디렉터 검토 | Claude 최종본 + 이미지 생성 프롬프트 | |
| `meeting` 회의실 | 3개 부서가 자기 자료로 토론 | 실장이 라운드마다 후보 정리 | 실장 결론 보고서 | 자료관리팀 정리·보관 |

- **Gemini**: 최신 정보 검색과 조사
- **Claude**: 긴 글 작성과 구조화
- **GPT**: 다른 시각에서 비판하고 검토

## 설치 (처음 한 번)

1. [Node.js](https://nodejs.org) 설치 (LTS 버전)
2. 세 AI 도구 설치 (Mac에서 권한 오류가 나면 아래 '문제 해결' 참고)
   ```bash
   npm install -g @anthropic-ai/claude-code @openai/codex
   curl -fsSL https://antigravity.google/cli/install.sh | bash
   ```
   > Gemini CLI(`gemini`)는 2026년 6월 18일부터 개인 구독(Google AI Pro/Ultra) 로그인을 받지 않아서, 대신 Antigravity CLI(`agy`)를 씁니다.
3. 각각 한 번씩 실행해서 **구독 계정으로 로그인**한 뒤 빠져나오기
   ```bash
   claude    # Claude 계정으로 로그인 → /exit
   codex     # "Sign in with ChatGPT" → Ctrl+C
   agy       # Google OAuth → Ctrl+C
   ```
4. 이 도구 받기 + `ai` 단축 명령 등록
   ```bash
   git clone https://github.com/dlarlachl-eng/cl.git ~/ai
   echo 'alias ai="bash ~/ai/ai.sh"' >> ~/.zshrc && source ~/.zshrc
   ai check
   ```

### 업데이트
```bash
ai update
```
`profile.md`, `notion.env`, `meeting/roster.json`, `output/`은 업데이트해도 그대로 남습니다.

### 문제 해결: npm 설치 권한 오류 (Mac)
```bash
mkdir -p ~/.npm-global && npm config set prefix ~/.npm-global
echo 'export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```
그다음 2번을 다시 실행하세요.

## 사용법

```bash
ai youtube  "아이폰 17 3주 사용 후기"
ai insta    "홈카페 라떼아트 3단계"
ai business "반려견 수제간식 구독 서비스"
ai travel   "도쿄 3박4일, 11월, 2인, 예산 150만원, 맛집 위주"
ai design   "카페 로고, 따뜻하고 미니멀하게"
```

### 참고 파일 넣기 (`-f`)
여러 개를 넣을 수 있습니다.

```bash
# 촬영본 자막을 넣으면 잘라낼 부분과 순서 변경을 타임코드로 제안
ai youtube "제주 브이로그" -f 촬영본_자막.txt

# 항공·숙소 정보를 넣으면 그 일정에 맞춰 계획
ai travel "오사카 3박4일" -f 항공숙소.txt
```

**영상 편집 팁**: 프리미어 프로나 캡컷의 자동 자막 기능으로 촬영본 자막(.srt 또는 .txt)을 뽑아 `-f`로 넣으세요. 그러면 AI가 실제 촬영 내용을 보고 컷 편집 계획을 짭니다.

### 사진 넣기 (`-i`)
사진 파일 여러 장이나 사진이 든 폴더를 넣을 수 있습니다. 아이폰 사진(HEIC)도 자동으로 변환됩니다.

```bash
# 폴더째로
ai business "티셔츠 사업성 분석" -i ~/Desktop/티셔츠사진

# 파일 여러 장
ai insta "토리네 홍보 릴스" -i 가게1.jpg 가게2.jpg
```

- 맨 처음 **Claude가 사진을 직접 보고** 자세히 정리합니다 (`0_사진분석.md`). 이 정리는 모든 AI에게 전달됩니다.
- **GPT도 검토 단계에서 사진을 직접** 봅니다.
- Gemini(agy)는 사진 대신 Claude의 정리를 받습니다.

### 내 정보 등록 (추천)
`profile.example.md`를 `profile.md`로 복사하고 내 채널, 톤, 쓰는 도구를 적어 두세요. 모든 요청 앞에 자동으로 붙어서, 매번 내 상황을 설명할 필요가 없습니다.

```bash
cp profile.example.md profile.md
```

## AI 회의실 (`meeting`)

세 부서의 AI 직원들이 회의 테이블에 앉아 안건을 두고 돌아가며 토론합니다. 브라우저 화면에서 누가 말하는지, 후보안이 어떻게 걸러지는지 실시간으로 볼 수 있어요.

| 부서 | 직원 (담당 AI) | 하는 일 | 들고 오는 자료 |
|---|---|---|---|
| **미래기획실** | 실장 (Claude, 진행·결론), 트렌드 연구원 (Gemini) | 앞으로 어떤 시리즈·포맷을 운용할지 | 릴스 기획안, 레퍼런스 분석, 릴스 팁 |
| **운영팀** | 팀장 (Codex), 편집 PD (Claude) | 지금 돌아가는 업로드 일정·성과, 이번 주에 실제로 만들 수 있는지 | 내 계정 진단, 유튜브 운영 계획, 다낭 할 일 |
| **자료관리팀** | 팀장 (Claude) | 영상 소스·지난 회의 보관, 중복 방지, 회의 후 정리 | T7 영상 소스 목록, 소재 통합 목록, 지난 회의 결론 |

```bash
ai meeting                                   # 브라우저가 열리면 안건 입력 후 '회의 시작'
ai meeting "다음 4주 릴스 기획" --rounds 2      # 바로 시작
ai meeting "신메뉴 정하기" -f 매출데이터.txt    # 모두에게 주는 참고자료
```

**회의 순서**
1. 회의를 시작하면 부서마다 자기 자료(노션 페이지·파일)를 읽어 옵니다. 오른쪽 '부서' 칸에 ✔/✖로 표시돼요.
2. 라운드마다 직원들이 자기 부서 자료를 근거로 동의·반박하며 한 번씩 말하고, 실장이 **후보 보드**를 정리합니다 (제외된 안은 취소선).
3. 마지막 라운드가 끝나면 실장이 **결론 보고서**를 씁니다.
4. 이어서 자료관리팀이 **자료 정리**를 합니다: 쓸 소스 경로, 아이디어 보관함(보류·제외 안과 다시 꺼낼 조건), 겹치는 점, 정리할 파일.
5. 이 정리는 다음 회의 때 자료관리팀이 '지난 회의'로 다시 읽어 옵니다.

- 회의 중에 오른쪽 **대표 지시** 칸에 "강의류는 제외해"처럼 쓰면 다음 발언부터 반영됩니다.
- 일시정지 / 중단 / 재생 속도 / JSON 내보내기를 지원합니다. 기록을 누르면 지난 발언을 다시 볼 수 있어요.
- 결과는 `output/날짜_meeting_안건/`에 저장됩니다: `1_회의록.md`, `2_결론.md`, `3_자료정리.md`, `회의록.json`. 노션 설정을 했으면 결론이 노션에도 올라갑니다.

**부서 자료 연결 (노션)**: 부서 자료는 노션 페이지에서 직접 읽어 옵니다. `ai notion`으로 만든 통합이 그 페이지를 볼 수 있어야 해요. 노션에서 **릴스 레퍼런스 분석 & 기획**, **한량의 일상 · 유튜브 운영 계획**, **다낭 출발 전 할 일**, **영상 소재 통합 목록** 페이지를 열고, 각각 `•••` → **연결(Connections)** → `AI 파이프라인`을 추가하세요. 하위 페이지는 자동으로 같이 연결됩니다. 연결이 안 된 자료는 ✖로 표시되고 그 자료 없이 회의가 진행됩니다.

**직원·부서 바꾸기**: `meeting/roster.example.json`을 `meeting/roster.json`으로 복사해서 고치세요.
- `teams`: 부서 이름, 색, 하는 일(`desc`), 자료(`sources`)
- `members`: 이름, 부서(`team`), 직책, 성격(`persona`), 담당 AI(`claude` | `gpt` | `gemini`), 아바타 이모지
- `chair`: 진행과 결론을 맡는 사람. `archivist`: 회의 후 자료 정리를 맡는 사람

자료(`sources`)는 이렇게 씁니다 (`#` 뒤는 메모):
```
"notion:https://www.notion.so/페이지링크  # 메모"
"file:meeting/data/이번주_성과.md  # 이 폴더 기준 파일"
"meetings  # 지난 회의 결론 5개 (자동)"
```

```bash
cp meeting/roster.example.json meeting/roster.json
ai meeting --roster meeting/다른구성.json   # 구성을 여러 개 두고 골라 쓰기
```

> 한 라운드에 AI를 (직원 수)번 부릅니다. 5명·2라운드면 결론과 자료 정리를 포함해 약 12번이라 구독 사용량을 꽤 씁니다. `DRY_RUN=1 ai meeting` 으로 화면만 먼저 구경할 수 있어요.

## 노션 자동 저장 (선택)

설정해 두면 실행이 끝날 때마다 최종본이 노션 페이지로 저장됩니다. 중간 과정은 맨 아래에 접기(토글)로 들어가요. 핸드폰 노션 앱에서 바로 볼 수 있어요.

1. https://www.notion.so/my-integrations 에서 **새 통합(New integration)** 만들기
   - 이름: `AI 파이프라인` (아무거나), 종류: **내부(Internal)**
   - 만든 뒤 나오는 **내부 통합 시크릿**(`ntn_`로 시작)을 복사
2. 노션에서 결과를 모을 페이지 만들기 (예: `AI 결과물`)
   - 페이지 오른쪽 위 `•••` → **연결(Connections)** → 방금 만든 `AI 파이프라인` 추가
   - 다시 `•••` → **링크 복사**
3. 터미널에서 실행하고, 물어보는 대로 시크릿과 링크를 붙여넣기
   ```bash
   ai notion
   ```
   `✔ 연결 성공`이 나오면 끝이에요.

시크릿은 이 폴더의 `notion.env`에만 저장되고 GitHub에는 올라가지 않습니다.
노션 저장이 실패해도 결과 파일은 `output/`에 그대로 남습니다.

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
- `DRY_RUN=1 ai travel "테스트"` 로 실행하면 AI를 부르지 않고 흐름만 점검합니다.

## 나만의 작업 추가하기

`pipelines/` 폴더의 파일 하나를 복사해서 프롬프트만 바꾸면 됩니다. 각 단계는 이렇게 생겼습니다.

```bash
결과=$(step 번호 담당AI 파일이름 "프롬프트")   # 담당AI: claude | gpt | gemini
```

그다음 `ai.sh`의 `case` 줄에 새 작업 이름을 추가하세요.
