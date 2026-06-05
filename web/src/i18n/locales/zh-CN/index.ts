import type { enUS } from '../en-US'
import { zhCNApiDebugger } from './apiDebugger'
import { zhCNCommon } from './common'
import { zhCNEntityTopoExplorer } from './entityTopoExplorer'
import { zhCNImports } from './imports'
import { zhCNLanding } from './landing'
import { zhCNQuery } from './query'
import { zhCNSettings } from './settings'
import { zhCNUModelExplorer } from './umodelExplorer'

export const zhCN = {
  ...zhCNApiDebugger,
  ...zhCNCommon,
  ...zhCNEntityTopoExplorer,
  ...zhCNImports,
  ...zhCNQuery,
  ...zhCNUModelExplorer,
  ...zhCNSettings,
  ...zhCNLanding,
} satisfies Record<keyof typeof enUS, string>
