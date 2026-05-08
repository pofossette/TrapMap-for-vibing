---
name: react-hooks-trap
description: React hooks 陷阱，包括过期闭包、缺失依赖项和 effect 清理
labels:
  - react
  - hooks
  - javascript
  - frontend
  - closure
  - useEffect
---

# React Hooks 陷阱

## useEffect 中的过期闭包

当 useEffect 在其闭包中捕获状态变量时，捕获的值在后续渲染中会变得过期。effect 读取旧状态值而非当前值，导致难以调试的不正确行为。该错误通常表现为在期望当前状态的地方出现 undefined 或 null 值。

前提条件：必须理解 JavaScript 闭包和 React 渲染模型。
需要将所有使用的变量添加到依赖数组中。

缓解方法：使用 exhaustive-deps eslint 规则。修复方法：将所有引用的状态和 props 添加到 useEffect 依赖数组中，或使用 useRef 持有跨渲染持久的可变值。

## Effect 中缺少清理

创建订阅、计时器或事件监听器而没有清理的 effect 会导致内存泄漏。组件卸载后 effect 回调继续运行，在已卸载的组件上更新状态。这会导致 "cannot update unmounted component" 警告和潜在崩溃。

需要从 useEffect 返回清理函数。修复方法：返回一个清理函数，用于移除事件监听器、清除间隔和取消订阅 observables。

## 列表中错误的 Key Prop

在列表渲染中使用数组索引作为 key，会在项目重新排序、插入或删除时导致状态损坏。React 不正确地复用 DOM 元素，导致未定义行为和视觉错误，这些错误在本地测试中难以复现，但在生产环境中使用真实数据时会出现。

修复方法：使用稳定的唯一标识符作为 key，而非数组索引。使用 vitest 测试以验证列表调和行为。
