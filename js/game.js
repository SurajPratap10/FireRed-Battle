// Boot: title screen, then straight into Battle Mode.
const Game = (() => {
  async function boot() {
    UI.init();
    await UI.title();
    await wait(300);
    BattleMode.open();
  }

  return { boot };
})();
