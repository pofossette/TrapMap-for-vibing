---
name: ci-pipeline-trap
description: CI/CD 管道陷阱，包括不稳定测试、缓存失效和超时级联
labels:
  - ci
  - cd
  - github
  - docker
  - testing
  - pipeline
  - vitest
---

# CI/CD 管道陷阱

## CI 中的不稳定测试计时

依赖计时的测试（setTimeout、动画帧、防抖）会因为 CI 容器资源较慢而间歇性失败。在本地开发中以 100ms 超时稳定通过的测试，在负载下的 CI 容器中会随机失败。该失败在本地无法复现，使调试极其困难。

前提条件：必须理解测试计时和确定性测试模式。
需要在测试中使用伪造计时器并避免真实等待。

缓解方法：使用 vitest 伪造计时器（vi.useFakeTimers）代替真实等待。修复方法：将所有 setTimeout 延迟替换为 vi.advanceTimersByTime，对异步断言使用 waitFor 工具，并为 CI 中真正不稳定的测试设置适当的重试次数。

## Docker 层缓存失效

缓存 Docker 层的 CI 管道在基础镜像或依赖变更时会遭遇缓存失效。缓存提供过时的层，CI 构建出包含过时依赖的镜像。这会导致生产中无法在本地开发中复现的运行时错误，因为本地 Docker 缓存不同。

修复方法：使用带显式缓存目标的多阶段构建，在构建前拉取最新基础镜像，并将锁文件哈希作为缓存键的一部分。

## 测试容器启动竞争条件

当 CI 启动数据库容器并立即运行测试时，测试会失败，因为数据库尚未准备好接受连接。错误为 "cannot connect to database" 或 "connection refused"。这是容器启动和测试执行之间的竞争条件。

需要健康检查等待策略。修复方法：为 docker-compose 服务定义添加健康检查，在运行测试前等待其就绪。使用 wait-for-it 或类似工具轮询数据库端口。
