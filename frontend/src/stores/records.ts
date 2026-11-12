// 预测记录与长期记忆从哪里来。后端还没有这两组接口：演示数据打开时返回虚构联赛的内容，关闭时是空的。
// 等后端提供接口后，只需要改这里，页面和统计计算不用动。
import { computed } from 'vue'
import { demoRecords } from '@/demo/records'
import type { PredictionRecord } from '@/types/records'
import { demoEnabled } from './demo'

export const predictionRecords = computed<PredictionRecord[]>(() => (demoEnabled.value ? demoRecords() : []))
