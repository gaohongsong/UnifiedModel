import type { enUSImports } from '../en-US/imports'

export const zhCNImports = {
  'imports.action.expire': '过期',
  'imports.action.put': '写入',
  'imports.action.validate': '校验',
  'imports.action.write': '写入',
  'imports.field.entities': '实体 JSON',
  'imports.field.ids': 'ID JSON',
  'imports.field.kind': '类型',
  'imports.field.relations': '关系 JSON',
  'imports.field.umodelElements': 'UModel 元素 JSON',
  'imports.kind.entity': '实体',
  'imports.kind.relation': '关系',
  'imports.mode.entity': '实体与拓扑',
  'imports.mode.expire': '手动过期',
  'imports.mode.umodel': 'UModel',
  'imports.operation': '操作',
  'imports.result.empty.detail': '执行当前模块操作后查看 API 响应',
  'imports.result.empty.title': '暂无响应。',
  'imports.result.latest': '当前模块最近一次操作响应',
  'imports.result.title': '响应',
  'imports.status.received': '已收到',
} satisfies Record<keyof typeof enUSImports, string>
