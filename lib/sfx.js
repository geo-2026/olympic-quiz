/* window.SFX : BGM 폴더 음원만 쓰도록 바뀐 뒤의 호환 쉘. 모든 짧은 효과음은 울리지 않는다.
   js/audio.js가 BGM/*.mp3를 직접 재생하고, 장면(scenes/*)의 SFX.play(...) 호출들은 조용히 통과한다.
   API는 그대로 유지해 호출부를 전부 뜯지 않도록 한다. */
window.SFX = (function () {
  const S = { on: false, vol: 0.6 };
  S.set = (on, vol) => { S.on = !!on; if (vol != null) S.vol = Math.max(0, Math.min(1, +vol)); return S.on; };
  S.play = () => null;
  S.note = () => null;
  S.seq = () => null;
  S.stopAll = () => {};
  return S;
})();
