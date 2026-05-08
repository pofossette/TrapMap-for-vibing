---
name: typescript-strict-trap
description: TypeScript strict 模式陷阱，包括类型收窄失败、any 泄漏和声明合并
labels:
  - typescript
  - javascript
  - strict-mode
  - type-safety
  - ts
---

# TypeScript Strict 模式陷阱

## 缺少类型注解导致的隐式 Any

当 TypeScript strict 模式未启用时，函数参数和返回类型默认为 any，会隐藏类型错误。在非 strict 模式下编译无错误的代码，在运行时会因 "undefined is not a function" 或 "cannot read property of null" 错误而失败。稍后迁移到 strict 模式会暴露数百个潜在类型错误。

前提条件：必须从项目开始时启用 strict 模式。
需要对所有导出函数和类方法显式标注类型。

缓解方法：从第一天起在 tsconfig.json 中启用 strict 模式。修复方法：在 tsconfig.json 中添加 `"strict": true` 并逐步解决所有由此产生的错误。仅在迁移期间临时使用 `// @ts-expect-error`。

## 联合类型中的类型收窄失败

使用联合类型（如 string | null）时，TypeScript 无法在异步回调或闭包内收窄类型。编译器会报告 "object is possibly null"，即使在 null 检查之后也是如此，因为变量可能在检查和回调执行之间发生变化。这会导致运行时 null 引用错误。

修复方法：使用返回布尔谓词的类型守卫，或在异步边界之前将值赋给 const。需要理解 TypeScript 的控制流分析。

## 声明合并与模块增强

使用声明合并来扩展第三方模块类型时，不正确的增强会静默破坏类型系统。类型可以编译但与运行时值不匹配，导致未定义行为。此错误在增强 express Request 类型或 vitest 匹配器时尤为常见。

缓解方法：保持增强最小化，并用运行时断言测试它们。修复方法：仅在专用的 .d.ts 文件中使用模块增强，用类型级测试验证增强的类型。
