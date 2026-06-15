export function renderDesktopOnboarding(setup = {}) {
  return `<div class="desktop-modal-backdrop">
    <section class="desktop-modal" role="dialog" aria-modal="true" aria-label="AI Creator OS Desktop first run">
      <div class="desktop-modal-head">
        <div>
          <p class="eyebrow">AI Creator OS 桌面版</p>
          <h2>欢迎使用多账号 X 运营工具箱</h2>
          <p class="muted">先初始化本地账号工具箱。数据会保存在你的电脑本地应用目录，不写入项目 repo。</p>
        </div>
      </div>
      <div class="desktop-setup-grid">
        <label class="field">
          <span>启动模式</span>
          <select name="desktopSetupMode">
            <option value="demo">使用样例数据体验</option>
            <option value="empty_workspace">创建空白账号库</option>
            <option value="import_accounts">从账号列表开始</option>
            <option value="restore">从 JSON 备份恢复</option>
          </select>
        </label>
        <label class="field">
          <span>工具箱名称</span>
          <input name="desktopWorkspaceName" type="text" value="${attr(setup.workspaceName || "我的账号工具箱")}">
        </label>
        <label class="field">
          <span>默认内容线</span>
          <select name="desktopDefaultLane">
            <option value="ai_startups">AI startup</option>
            <option value="indie_builders">Indie builder</option>
            <option value="saas_founders">SaaS founder</option>
            <option value="crypto_builders">Crypto builder</option>
          </select>
        </label>
        <label class="field">
          <span>默认语言</span>
          <input name="desktopDefaultLanguage" type="text" value="en">
        </label>
        <label class="field">
          <span>默认国家</span>
          <input name="desktopDefaultCountry" type="text" value="">
        </label>
        <label class="field">
          <span>每日发文上限</span>
          <input name="desktopDailyPostLimit" type="number" min="1" max="100" value="10">
        </label>
      </div>
      <label class="field">
        <span>粘贴账号 handle，一行一个</span>
        <textarea name="desktopSetupAccounts" rows="4" placeholder="@account_001&#10;@account_002"></textarea>
      </label>
      <label class="field">
        <span>CSV 导入账号（handle,lane,country,language,notes）</span>
        <textarea name="desktopSetupCsv" rows="4" placeholder="handle,lane,country,language,notes&#10;@builder,ai_startups,US,en,main account"></textarea>
      </label>
      <label class="field">
        <span>JSON 备份内容（仅选择恢复模式时使用）</span>
        <textarea name="desktopSetupBackup" rows="4" placeholder="粘贴 AI Creator OS Desktop backup JSON"></textarea>
      </label>
      <div class="desktop-safety-note">
        不导入密码、cookie、代理或指纹信息。单账号窗口只用于人工查看和人工操作。
      </div>
      <div class="desktop-modal-actions">
        <button class="button secondary" data-desktop-setup="demo" type="button">使用样例数据</button>
        <button class="button" data-desktop-setup="complete" type="button">完成初始化</button>
      </div>
    </section>
  </div>`;
}

function attr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
