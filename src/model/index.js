import { listen, unListen } from "@/api/promiseSocket";
import { createRPCParams } from "@/api/util";
import config from "@/config";

const url = config.WS_URL;

//广播hex
export async function broadcastHex(txHex) {
  const channel = "broadcastTx";
  // const channel = "validateTx";
  const params = createRPCParams(channel);
  params.params = params.params.concat([txHex]);
  const res = await listen({
    url,
    channel,
    params: {
      cmd: true,
      channel: "psrpc:" + JSON.stringify(params)
    }
  });
  // console.log(res, 999)
  return res;
}

// 获取账户资产列表
export async function getAssetList(address) {
  const channel = "getAccountLedgerList";
  const params = createRPCParams(channel);
  params.params.push(address);
  const res = await listen({
    url,
    channel,
    params: {
      cmd: true,
      channel: "psrpc:" + JSON.stringify(params)
    }
  });
  return res;
}

// 获取区块信息
export async function getBlockInfo() {
  const channel = "getNodeInfo";
  const params = createRPCParams(channel);
  const res = await listen({
    url,
    channel,
    params: {
      cmd: true,
      channel: "psrpc:" + JSON.stringify(params)
    }
  });
  return res;
}

// 通过symbol获取资产价格
export async function uniAssetPrice(symbol) {
  const channel = "uniAssetPrice";
  const params = {
    method: channel,
    params: {
      symbol
    }
  };
  const res = await listen({
    url,
    channel,
    params: {
      cmd: true,
      channel: "cmd:" + JSON.stringify(params)
    }
  });
  return res;
}

export async function getAssetBalance(chainId, assetId, address) {
  const channel = "getAccountBalance";
  const params = createRPCParams(channel);
  params.params = params.params.concat([chainId, assetId, address]);
  const res = await listen({
    url,
    channel,
    params: {
      cmd: true,
      channel: "psrpc:" + JSON.stringify(params)
    }
  });
  return res;
}
