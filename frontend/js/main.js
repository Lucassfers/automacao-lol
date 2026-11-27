// Ponto de entrada do painel Rift Builds: restaura a sessão, liga os eventos da página e inicia catálogo e poll do draft.
import { refresh, renderDraft } from "./app/controller.js";
import { loadCatalog, loadPositions, loadWinrates } from "./app/loaders.js";
import { bindEnemySearch, bindToneFilter, renderEnemyPicker } from "./components/enemy-column.js";
import { bindGuide } from "./components/guide.js";
import { bindHeroArt } from "./components/hero.js";
import { bindOwnSearch, renderOwnPicker } from "./components/own-picker.js";
import { bindRoleFilters } from "./components/role-filter.js";
import { setRefreshHandler } from "./core/refresh.js";
import { restoreSession } from "./core/storage.js";
import { startDraftPolling } from "./services/draft-poller.js";

restoreSession();
setRefreshHandler(refresh);

bindHeroArt();
bindOwnSearch();
bindEnemySearch();
bindRoleFilters({ own: renderOwnPicker, enemy: renderEnemyPicker });
bindToneFilter();
bindGuide();

loadCatalog().then(() => {
  startDraftPolling(renderDraft);
  loadWinrates();
  loadPositions();
});
