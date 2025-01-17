<template>
  <div
    class="swap pd_40_rd_20 mobile-p"
    v-loading="loading"
    element-loading-background="rgba(255, 255, 255, 0.8)"
  >
    <div class="icon-wrap flex-between">
      <div class="left click" @click="toggleExpand">
        <i class="iconfont icon-zhankai"></i>
      </div>
      <div class="right flex-center">
        <span @click="refreshRate"><i class="iconfont icon-shuaxin"></i></span>
        <span><i class="iconfont icon-fenxiang"></i></span>
        <span @click="toggleSettingDialog">
          <i class="iconfont icon-shezhi"></i>
        </span>
      </div>
    </div>
    <div class="swap-area">
      <div class="from-symbol">
        <custom-input
          v-model:inputVal="fromAmount"
          :label="$t('trading.trading4')"
          :icon="fromAsset.symbol"
          :assetList="assetsList"
          :balance="fromAsset.available"
          :errorTip="fromAmountError"
          @selectAsset="selectAsset($event, 'from')"
          @max="max('from')"
        ></custom-input>
      </div>
      <div class="change-direction">
        <img class="click" src="../../assets/img/swap-to.svg" alt="" />
      </div>
      <div class="to-symbol">
        <custom-input
          v-model:inputVal="toAmount"
          :label="$t('trading.trading3')"
          :icon="toAsset.symbol"
          :assetList="assetsList"
          :balance="toAsset.available"
          :errorTip="toAmountError"
          @selectAsset="asset => selectAsset(asset, 'to')"
          @max="max('to')"
        ></custom-input>
      </div>
      <div class="exchange-rate" v-if="swapRate">
        <!-- 1 BNB ≈ 2347.38 USDT -->
        {{ swapRate }}
        <i class="iconfont icon-qiehuan" @click="toggleDirection"></i>
      </div>
      <div class="confirm-wrap">
        <el-button type="primary" :disabled="disableTx" @click="swapTrade">
          {{ insufficient ? $t("public.public17") : $t("public.public10") }}
        </el-button>
      </div>
    </div>
    <div
      v-show="swapRate"
      :class="['setting-and-route', swapRate ? 'show' : '']"
    >
      <div class="swap-setting-info">
        <div class="info-item flex-between">
          <div class="left">{{ $t("trading.trading6") }}</div>
          <div class="right">{{ protectPercent }}%</div>
        </div>
        <div class="info-item flex-between">
          <div class="left">{{ $t("trading.trading7") }}</div>
          <div class="right">0.03%</div>
        </div>
        <div class="info-item flex-between">
          <div class="left">{{ $t("trading.trading8") }}</div>
          <div class="right">{{ minReceive }} {{ toAsset.symbol }}</div>
        </div>
        <div class="info-item flex-between">
          <div class="left">{{ $t("trading.trading9") }}</div>
          <div class="right">0.3%</div>
        </div>
      </div>
      <div class="swap-route">
        <div class="name">{{ $t("trading.trading10") }}</div>
        <div class="route-network flex-center">
          <div
            class="route-item"
            v-for="(item, index) in routesSymbol"
            :key="item"
          >
            <div class="flex-center">
              <symbol-icon :icon="item"></symbol-icon>
              <span>{{ item }}</span>
            </div>
            <span
              class="el-icon-arrow-right"
              v-if="index !== routesSymbol.length - 1"
            ></span>
          </div>
        </div>
      </div>
    </div>
    <el-dialog
      :title="$t('trading.trading11')"
      custom-class="swap-setting"
      :show-close="false"
      width="470px"
      v-model="settingDialog"
    >
      <div class="content">
        <div class="set-item">
          <div class="name">{{ $t("trading.trading12") }}</div>
          <div class="protect flex-center">
            <span
              :class="[
                'number',
                'click',
                protectPercent === item ? 'active' : ''
              ]"
              v-for="item in protectSets"
              :key="item"
              @click="protectPercent = item"
            >
              {{ item }}%
            </span>
            <el-input v-model="protectPercent" />
            %
          </div>
        </div>
        <!-- <div class="bottom">
          <el-button @click="toggleSettingDialog">
            {{ $t("public.public8") }}
          </el-button>
          <el-button type="primary" @click="toggleSettingDialog">
            {{ $t("public.public9") }}
          </el-button>
        </div> -->
      </div>
    </el-dialog>
  </div>
</template>

<script>
import {
  defineComponent,
  ref,
  reactive,
  toRefs,
  watch,
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount
} from "vue";
import CustomInput from "@/components/CustomInput.vue";
import {
  Minus,
  Division,
  fixNumber,
  timesDecimals,
  parseChainInfo,
  divisionAndFix,
  Times,
  divisionDecimals
} from "@/api/util";
import { useI18n } from "vue-i18n";
import { getBestTradeExactIn, getSwapPairInfo } from "@/model";
import nerve from "nerve-sdk-js";
import { useStore } from "vuex";
import { ElMessage } from "element-plus";
import SymbolIcon from "@/components/SymbolIcon.vue";
import { NTransfer } from "@/api/api";

export default defineComponent({
  name: "swap",
  components: {
    CustomInput,
    SymbolIcon
  },
  props: {
    assetsList: Array
  },
  setup(props, context) {
    let storedSwapPairInfo = {}; // 缓存的swapPairInfo
    const { t } = useI18n();
    const store = useStore();
    const talonAddress = computed(() => {
      return store.getters.talonAddress;
    });
    const state = reactive({
      feeRate: 0.3, // 千三的手续费
      fromAmount: "",
      toAmount: "",
      fromAsset: {},
      toAsset: {},
      fromAmountError: "",
      toAmountError: "",
      disableWatchFromAmount: false, // 停止监听fromAmount
      disableWatchToAmount: false, // 停止监听toAmount
      insufficient: false, // 流动性不足
      protectPercent: 1, // 划点保护
      protectSets: [0.5, 1, 3],
      routesSymbol: [],
      loading: false
    });

    // 选择swap资产 asset-选择的资产, type-from/to
    function selectAsset(asset, type) {
      // console.log(asset, type, 9999);
      state.fromAmount = "";
      state.toAmount = "";
      if (type === "from") {
        state.fromAsset = asset;
        if (state.fromAsset.assetKey === state.toAsset.assetKey) {
          state.toAsset = {};
        }
      } else {
        state.toAsset = asset;
        if (state.fromAsset.assetKey === state.toAsset.assetKey) {
          state.fromAsset = {};
        }
      }

      state.insufficient = false;

      getSwapRate(true);
      if (state.fromAsset.assetKey && state.toAsset.assetKey) {
        context.emit("selectAsset", state.fromAsset, state.toAsset);
      }
      storeSwapPairInfo();
    }

    // 缓存交易对的兑换信息 refresh-刷新
    async function storeSwapPairInfo(refresh = false) {
      const fromAssetKey = state.fromAsset.assetKey;
      const toAssetKey = state.toAsset.assetKey;
      const key = fromAssetKey + "_" + toAssetKey;
      if (fromAssetKey && toAssetKey) {
        // console.log(fromAssetKey, toAssetKey, "---===---");
        if (storedSwapPairInfo[key] && !refresh) {
          // 如果存在切不需要刷新 则跳过
          context.emit("updateRate", storedSwapPairInfo[key].swapRate);
        } else {
          const res = await getBestTradeExactIn({
            tokenInStr: fromAssetKey,
            tokenOutStr: toAssetKey,
            tokenInAmount: timesDecimals(1, state.fromAsset.decimals) // 随便输入的 1
          });
          // console.log(res, 9666);
          if (res) {
            const routes = res.tokenPath.map(v => {
              return v.symbol;
            });
            const idKeys = res.tokenPath.map(v => {
              return {
                chainId: v.assetChainId,
                assetId: v.assetId,
                decimals: v.decimals
              };
            });
            // 如果路径为3 则通过两次getSwapPairInfo缓存两个流动池的余额
            if (res.tokenPath.length > 2) {
              const middleKey =
                res.tokenPath[1].assetChainId + "-" + res.tokenPath[1].assetId;
              const result1 = await getSwapPairInfo({
                tokenAStr: fromAssetKey,
                tokenBStr: middleKey
              });
              const result2 = await getSwapPairInfo({
                tokenAStr: middleKey,
                tokenBStr: toAssetKey
              });
              if (result1 && result2) {
                const pairs = [
                  nerve.swap.pair(
                    {
                      chainId: result1.token0.assetChainId,
                      assetId: result1.token0.assetId
                    },
                    {
                      chainId: result1.token1.assetChainId,
                      assetId: result1.token1.assetId
                    },
                    result1.reserve0,
                    result1.reserve1
                  ),
                  nerve.swap.pair(
                    {
                      chainId: result2.token0.assetChainId,
                      assetId: result2.token0.assetId
                    },
                    {
                      chainId: result2.token1.assetChainId,
                      assetId: result2.token1.assetId
                    },
                    result2.reserve0,
                    result2.reserve1
                  )
                ];

                storedSwapPairInfo[key] = {
                  routes,
                  pairs,
                  idKeys
                };
              }
            } else {
              const result = await getSwapPairInfo({
                tokenAStr: fromAssetKey,
                tokenBStr: toAssetKey
              });
              if (result) {
                storedSwapPairInfo[key] = {
                  routes,
                  pairs: [
                    nerve.swap.pair(
                      {
                        chainId: result.token0.assetChainId,
                        assetId: result.token0.assetId
                      },
                      {
                        chainId: result.token1.assetChainId,
                        assetId: result.token1.assetId
                      },
                      result.reserve0,
                      result.reserve1
                    )
                  ],
                  idKeys
                };
              }
            }
          } else {
            storedSwapPairInfo[key] = {
              routes: [] // 流动性不足
            };
          }
          const rate = res
            ? divisionDecimals(
                res.tokenAmountOut.amount,
                res.tokenAmountOut.token.decimals
              )
            : "0";
          storedSwapPairInfo[key].swapRate = rate + state.toAsset.symbol; // 兑换比例 1 in / n out
          context.emit("updateRate", storedSwapPairInfo[key].swapRate);
        }
      }
      state.routesSymbol = storedSwapPairInfo[key]
        ? storedSwapPairInfo[key].routes
        : [];
      // console.log(storedSwapPairInfo, 666);
    }

    // 监听fromAmount变化
    watch(
      () => state.fromAmount,
      async val => {
        if (val) {
          if (
            !Number(state.fromAsset.available) ||
            Minus(state.fromAsset.available, val) < 0
          ) {
            state.fromAmountError = t("transfer.transfer15");
          } else {
            state.fromAmountError = "";
          }

          if (!state.disableWatchFromAmount) {
            const res = getSwapAmount(val, "to"); // 通过from计算to
            state.insufficient = res === 0;
            if (res) {
              state.disableWatchToAmount = true; // 避免进入无限循环计算
              state.toAmount = res;
              getSwapRate();
              await nextTick();
              state.disableWatchToAmount = false;
            } else {
              getSwapRate(true);
            }
          }
        } else {
          getSwapRate(true);
        }
      }
    );
    watch(
      () => state.toAmount,
      async val => {
        if (val) {
          if (!state.disableWatchToAmount) {
            const res = getSwapAmount(val, "from"); // 通过to计算from
            state.insufficient = res === 0;
            if (res) {
              state.disableWatchFromAmount = true;
              state.fromAmount = res;
              getSwapRate();
              await nextTick();
              state.disableWatchFromAmount = false;
            } else {
              getSwapRate(true);
            }
          }
        } else {
          getSwapRate(true);
        }
      }
    );

    async function refreshRate() {
      await storeSwapPairInfo(true);
      const res = getSwapAmount(state.fromAmount, "to"); // 通过from计算to
      // console.log(res, "fff");
      state.insufficient = res === 0;
      if (res) {
        state.disableWatchToAmount = true; // 避免进入无限循环计算
        state.toAmount = res;
        getSwapRate();
        await nextTick();
        state.disableWatchToAmount = false;
      } else {
        getSwapRate(true);
      }
    }
    let timer;
    onMounted(() => {
      timer = setInterval(() => {
        storeSwapPairInfo(true);
      }, 10000);
    });
    onBeforeUnmount(() => {
      clearInterval(timer);
    });

    // 计算能兑换的数量 type- 计算from/to的数量
    function getSwapAmount(amount, type) {
      const fromAssetKey = state.fromAsset.assetKey;
      const toAssetKey = state.toAsset.assetKey;
      if (fromAssetKey && toAssetKey && !isNaN(amount) && amount > 0) {
        const fromDecimal =
          type === "from" ? state.toAsset.decimals : state.fromAsset.decimals;
        const toDecimal =
          type === "from" ? state.fromAsset.decimals : state.toAsset.decimals;
        amount = timesDecimals(amount, fromDecimal);
        const key = fromAssetKey + "_" + toAssetKey;
        const info = storedSwapPairInfo[key];
        if (!info) {
          // setTimeout(() => {
          //   getSwapAmount(amount, type);
          // }, 200);
          return false;
        }
        // debugger;
        if (info && info.routes.length) {
          const { idKeys: tokenPathArray, pairs: pairsArray } = info;
          let res =
            type === "from"
              ? nerve.swap.getAmountsIn(amount, tokenPathArray, pairsArray)
              : nerve.swap.getAmountsOut(amount, tokenPathArray, pairsArray);
          console.log(
            res,
            amount,
            tokenPathArray,
            pairsArray,
            3333,
            res[res.length - 1].toString()
          );
          res =
            type === "from"
              ? res[0].toString()
              : res[res.length - 1].toString();
          console.log(res, 444);
          return divisionAndFix(res, toDecimal, toDecimal);
        } else {
          return 0;
        }
      }
      return false;
    }

    function getSwapRate(clear) {
      if (clear) {
        swapRate.value = "";
        // console.log(state.toAsset.symbol, 9888);
        return;
      }
      const fromAmount = state.fromAmount;
      const toAmount = state.toAmount;
      if (swapDirection.value === "from-to") {
        swapRate.value = `1 ${state.fromAsset.symbol} ≈ ${fixNumber(
          Division(toAmount, fromAmount).toFixed(),
          state.toAsset.decimals
        )} ${state.toAsset.symbol}`;
      } else {
        swapRate.value = `1 ${state.toAsset.symbol} ≈ ${fixNumber(
          Division(fromAmount, toAmount).toFixed(),
          state.fromAsset.decimals
        )} ${state.fromAsset.symbol}`;
      }
    }

    const minReceive = computed(() => {
      if (!state.toAmount) return "";
      return fixNumber(
        Times(state.toAmount, 1 - state.protectPercent / 100).toFixed(),
        state.toAsset.decimals
      );
    });

    const swapRate = ref(""); // swap兑换比例
    const swapDirection = ref("from-to"); // 比例方向

    function toggleDirection() {
      swapDirection.value =
        swapDirection.value === "from-to" ? "to-from" : "from-to";
      getSwapRate();
    }

    function max(type) {
      if (type === "from") {
        state.fromAmount = state.fromAsset.available;
      } else {
        state.toAmount = state.toAsset.available;
      }
    }

    const disableTx = computed(() => {
      return !!(
        !state.fromAmount ||
        !state.fromAsset.symbol ||
        !state.toAmount ||
        !state.toAsset.symbol ||
        state.insufficient ||
        !talonAddress.value
      );
    });

    const settingDialog = ref(false);
    function toggleExpand() {
      if (!state.fromAsset.symbol || !state.toAsset.symbol) return;
      context.emit("toggleExpand");
    }
    function toggleSettingDialog() {
      settingDialog.value = !settingDialog.value;
    }

    async function swapTrade() {
      state.loading = true;
      const fromAssetKey = state.fromAsset.assetKey;
      const toAssetKey = state.toAsset.assetKey;
      const fromDecimal = state.fromAsset.decimals;
      const toDecimal = state.toAsset.decimals;
      const key = fromAssetKey + "_" + toAssetKey;
      const info = storedSwapPairInfo[key];
      try {
        const fromAddress = talonAddress.value;
        const amountIn = timesDecimals(state.fromAmount, fromDecimal); // 卖出的资产数量
        // 币币交换资产路径，路径中最后一个资产，是用户要买进的资产
        const tokenPath = info.idKeys;
        const amountOutMin = timesDecimals(minReceive.value, toDecimal).split(
          "."
        )[0]; // 最小买进的资产数量
        const feeTo = null; // 交易手续费取出一部分给指定的接收地址
        const deadline = nerve.swap.currentTime() + 300; // 过期时间
        const toAddress = fromAddress; // 资产接收地址
        const remark = "";
        const tx = await nerve.swap.swapTrade(
          fromAddress,
          amountIn,
          tokenPath,
          amountOutMin,
          feeTo,
          deadline,
          toAddress,
          remark
        );
        const res = await handleHex(tx.hex);
        if (res && res.hash) {
          ElMessage.success({
            message: t("transfer.transfer14"),
            type: "success"
          });
        } else {
          ElMessage.warning({
            message: "Swap Failed",
            type: "warning"
          });
        }
      } catch (e) {
        console.log(e, "Swap-error");
        ElMessage.warning({
          message: e.message || e,
          type: "warning"
        });
      }
      state.loading = false;
    }

    const addressInfo = computed(() => {
      return store.state.addressInfo;
    });

    async function handleHex(hex) {
      const tAssemble = nerve.deserializationTx(hex);
      const transfer = new NTransfer({ chain: "NERVE" });
      const txHex = await transfer.getTxHex({
        tAssemble,
        pub: addressInfo.value?.pub,
        signAddress: addressInfo.value?.address?.Ethereum
      });
      console.log(txHex, "===txHex===");
      return await transfer.broadcastHex(txHex);
    }

    return {
      ...toRefs(state),
      minReceive,
      selectAsset,
      max,
      disableTx,
      swapRate,
      swapDirection,
      toggleDirection,
      settingDialog,
      toggleExpand,
      toggleSettingDialog,
      swapTrade,
      refreshRate
    };
  }
});
</script>

<style lang="scss" scoped>
.swap {
  width: 470px;
  /* height: 752px; */
  padding-bottom: 30px;
  .icon-wrap {
    .left {
      width: 27px;
      height: 25px;
      i {
        font-size: 22px;
      }
    }
    .right {
      span {
        margin-left: 15px;
        cursor: pointer;
        i {
          font-size: 22px;
        }
      }
    }
  }
  .from-symbol {
    margin-top: 18px;
  }
  .change-direction {
    margin: 12px 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .exchange-rate {
    margin-top: 20px;
    margin-bottom: -5px;
    display: flex;
    justify-content: center;
    i {
      font-size: 16px;
      margin: 3px 0 0 5px;
      cursor: pointer;
      color: #4a5ef2;
    }
  }
  .swap-area {
    .confirm-wrap {
      margin: 25px 0 40px;
    }
  }
  .swap-setting-info {
    border-top: 1px solid #e3eeff;
    border-bottom: 1px solid #e3eeff;
    padding: 18px 0;
    .info-item {
      margin-bottom: 18px;
      &:last-child {
        margin-bottom: 0;
      }
      * {
        line-height: 1;
      }
      .left {
        color: #7e87c2;
      }
    }
  }
  .setting-and-route {
    overflow: hidden;
    /* &.show {
      animation: expand 0.3s;
    } */
  }
  .swap-route {
    .name {
      padding: 18px 0;
      color: #7e87c2;
    }
    .route-network {
      flex-wrap: wrap;
    }
    .route-item {
      display: flex;
      align-items: center;
      width: 35%;
      &:last-child {
        width: 20%;
      }
      img {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        margin-right: 10px;
      }
      span {
        font-weight: 600;
      }
      .el-icon-arrow-right {
        margin: 0 20px;
        font-size: 22px;
      }
    }
  }
  .swap-setting {
    .content {
      .set-item {
        margin-bottom: 40px;
      }
      .name {
        margin-bottom: 10px;
      }
      .protect {
        .number {
          width: 70px;
          height: 44px;
          line-height: 44px;
          text-align: center;
          color: #4a5ef2;
          background-color: #e4e7ff;
          margin-right: 20px;
          border-radius: 15px;
          &.active {
            color: #fff;
            background-color: #4a5ef2;
          }
        }
      }
      :deep(.el-input) {
        width: 100px;
        margin-right: 3px;
        .el-input__inner {
          border-radius: 10px;
        }
      }
      .bottom {
        padding: 0 0 20px;
        :deep(.el-button) {
          width: 185px;
          height: 48px;
          border-radius: 15px;
          &:first-child {
            margin-right: 10px;
          }
        }
      }
    }
  }
}
@keyframes expand {
  0% {
    height: 0px;
  }
  100% {
    height: 245px;
  }
}
@media screen and (max-width: 1200px) {
  .mobile-p {
    padding: 20px !important;
  }
  .w1300 {
    margin: 10px !important;
  }
  ::v-deep .el-overlay {
    padding: 20px !important;
  }
  ::v-deep .el-dialog {
    margin: 15vh auto;
    width: 100% !important;
    max-width: 470px !important;
    min-width: 280px !important;
    .el-dialog__body {
      padding-left: 20px !important;
      padding-right: 20px !important;
    }
  }
}
</style>
