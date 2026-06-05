import { enUSApiDebugger } from './apiDebugger'
import { enUSCommon } from './common'
import { enUSEntityTopoExplorer } from './entityTopoExplorer'
import { enUSImports } from './imports'
import { enUSLanding } from './landing'
import { enUSQuery } from './query'
import { enUSSettings } from './settings'
import { enUSUModelExplorer } from './umodelExplorer'

export const enUS = {
  ...enUSApiDebugger,
  ...enUSCommon,
  ...enUSEntityTopoExplorer,
  ...enUSImports,
  ...enUSQuery,
  ...enUSUModelExplorer,
  ...enUSSettings,
  ...enUSLanding,
} as const
