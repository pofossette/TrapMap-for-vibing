---
name: docker-deploy-trap
description: 生产环境常见的 Docker 部署陷阱及其缓解方法
labels:
  - docker
  - deployment
  - production
  - infrastructure
  - container
---

# Docker 部署陷阱

## 多阶段构建中的过期构建缓存

使用 Docker 多阶段构建时，如果基础镜像更新但 Docker 缓存层未失效，构建缓存可能会过期。这会导致生产部署使用过时的依赖或安全补丁，从而导致生产环境崩溃和错误。

前提条件：必须理解 Docker 层缓存和多阶段构建模式。
需要显式使用 `--no-cache` 标志或通过摘要固定基础镜像。

缓解方法：通过 SHA256 摘要而非标签固定基础镜像。修复方法：使用 `docker build --pull` 强制基础镜像更新，并在 `RUN npm ci` 之前添加 `COPY package.json package-lock.json ./`，确保依赖变更使缓存失效。

此错误在 CI 管道中尤为常见，其中 Docker 构建在提交之间被缓存。容器看似构建成功，但包含过时的代码或依赖。

## 缺少资源限制导致的 OOM Kill

Kubernetes 会用 OOM 错误杀死超出内存限制的容器。当 Docker 容器在 Kubernetes 中没有显式内存限制运行时，它们可能会消耗所有节点内存并被杀死。Pod 会以 CrashLoopBackOff 状态重启。

需要在 Kubernetes 部署清单中设置 requests 和 limits。修复方法：为所有容器规格添加 `resources.limits.memory` 和 `resources.requests.memory`。在生产部署前在 Staging 环境中测试资源行为。

## 跨环境的环境变量不匹配

当 Docker 容器在本地开发、Staging 和生产环境之间使用不同的 .env 文件时，配置漂移会导致未定义行为和崩溃。常见问题包括缺少 DATABASE_URL、错误的 API 端点和不匹配的功能标志。

缓解方法：使用单一配置来源，在容器启动时验证环境变量。修复方法：实现启动验证脚本，在主进程启动前检查所有必需的环境变量。
