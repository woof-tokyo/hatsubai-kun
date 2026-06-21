import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConnectMessage, connectMeta, type ConnectStatus } from "../src/onboarding.ts";

const free: ConnectStatus = { hkKeyPresent: false, hkValid: false, publisherKeyPresent: false };
const freeWithSteam: ConnectStatus = { hkKeyPresent: false, hkValid: false, publisherKeyPresent: true };
const connected: ConnectStatus = {
  hkKeyPresent: true,
  hkValid: true,
  studioName: "Woof Studio",
  email: "dev@example.com",
  publisherKeyPresent: false,
};
const invalid: ConnectStatus = { hkKeyPresent: true, hkValid: false, publisherKeyPresent: false };

test("未登録: 無料・単体モードの案内と登録手順を返す", () => {
  const msg = buildConnectMessage(free);
  assert.match(msg, /無料・単体モード/);
  assert.match(msg, /hatsubai-kun\.com/);
  assert.match(msg, /HATSUBAIKUN_KEY/);
  // 接続済み/無効の文言は出さない
  assert.doesNotMatch(msg, /接続済み/);
  assert.doesNotMatch(msg, /無効/);
});

test("未登録(Steam財務キーあり): STEAM_PUBLISHER_KEYの再案内はしない", () => {
  const msg = buildConnectMessage(freeWithSteam);
  assert.match(msg, /無料・単体モード/);
  assert.match(msg, /STEAM_PUBLISHER_KEY は設定済み/);
});

test("接続済み: スタジオ名と使える連携ツールを返す", () => {
  const msg = buildConnectMessage(connected);
  assert.match(msg, /接続済み/);
  assert.match(msg, /Woof Studio/);
  assert.match(msg, /register_game/);
});

test("接続済み(Steam財務キーなし): 売上同期の有効化を案内する", () => {
  const msg = buildConnectMessage(connected);
  assert.match(msg, /STEAM_PUBLISHER_KEY も設定/);
});

test("キーが無効: 再発行の対処を案内する", () => {
  const msg = buildConnectMessage(invalid);
  assert.match(msg, /無効/);
  assert.match(msg, /再発行/);
  // 無効時も無料モードは使える旨を伝える
  assert.match(msg, /無料・単体モード/);
});

test("connectMeta: 状態を機械可読で返す", () => {
  assert.deepEqual(connectMeta(free), {
    connected: false,
    mode: "free",
    has_platform_key: false,
    has_steam_publisher_key: false,
    register_url: "https://hatsubai-kun.com",
  });
  assert.deepEqual(connectMeta(connected), {
    connected: true,
    mode: "platform",
    has_platform_key: true,
    has_steam_publisher_key: false,
    register_url: "https://hatsubai-kun.com",
  });
});
