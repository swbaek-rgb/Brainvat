# BGM 시안 (Suno용, 2026-10-15)

톤: 어두운 실험실, 고립, 낮은 기계음. 멜로디가 앞에 나서지 않는다. 방치형이라 한 시간 들어도 질리지 않아야 한다.
공통 금지: 드럼 비트, 보컬, 밝은 코드, 오케스트라 스웰, 8비트 칩튠(픽셀 그림체와 겹치면 유치해진다).

## 1. 메인 화면 루프 (가장 중요)
Style:
dark ambient drone, laboratory hum, low sine bass at 50hz, faint tape hiss, slow detuned analog pad,
sparse single piano notes every 20-30 seconds, no drums, no melody, no vocals, very slow, minimal,
underwater, glass tank resonance, melancholic, loopable, 120 seconds
Lyrics: [Instrumental]
Exclude: drums, percussion, vocals, choir, orchestra, chiptune, upbeat

## 2. 인트로 (실험 기록 0일차)
Style:
solo detuned upright piano, sparse, one note at a time with long silence between, room reverb,
faint vinyl crackle, dark, patient, like a letter being written at night, no drums, no vocals,
minimal, slow, 90 seconds, ends unresolved
Lyrics: [Instrumental]

## 3. 기도 도착 (짧은 단서음, 4~8초)
Style:
single glass harmonica note with slow swell, bone-dry, no reverb tail, fades to silence,
one tone only, 6 seconds, sound design, no music
Lyrics: [Instrumental]
비고: Suno는 짧은 곡을 잘 못 만든다. 30초짜리로 뽑고 앞 6초만 잘라 쓴다.

## 4. 죽음 / 마지막 기도
Style:
very slow dark ambient, a single sustained low cello note slowly losing pitch and fading,
distant machine hum shutting down, silence growing, no drums, no vocals, 60 seconds,
ends in complete silence
Lyrics: [Instrumental]

## 5. 통 해제 / 전원 켜짐 (vats_unlock용)
Style:
low electrical hum powering up, a rising sub bass swell over 8 seconds, then a soft high
sine tone holds, laboratory, no music, sound design, 15 seconds
Lyrics: [Instrumental]

## Suno 조작 요령
- Custom 모드 켜고 Style 칸에 위 문장, Lyrics 칸에 [Instrumental]. 일반 모드는 멜로디가 생겨버린다.
- 같은 Style로 4~6개 뽑아서 가장 "아무 일도 안 일어나는" 것을 고른다. 이 게임은 지루한 쪽이 맞다.
- 루프: Suno 출력은 끝이 페이드아웃이라 그대로 반복하면 끊긴다. 가운데 60~90초를 잘라서 앞뒤 2초 크로스페이드로 잇는다.
- 길이는 Extend로 늘리지 말고 짧은 걸 루프하는 편이 낫다. Extend는 분위기가 바뀐다.
- 볼륨: 메인 루프는 -18 LUFS 정도로 아주 작게. 기도 단서음만 그보다 6dB 크게.

## 화면 연결 계획
- 메인 루프: 인트로 "전원을 넣는다" 뒤 페이드인. Web Audio로 루프 구간 지정.
- 들어줌: 루프 볼륨을 1.5초간 0으로 내렸다가 복귀 (소리가 '멎는' 것이 반응).
- 기도 도착: 단서음 1회. 침묵 처리될 때는 아무 소리 없음.
- 죽음: 루프 볼륨 절반, 죽음 트랙 1회 재생 후 루프 복귀.
- 브라우저는 클릭 전 자동재생을 막으므로 인트로 첫 클릭에서 오디오 컨텍스트를 연다.
