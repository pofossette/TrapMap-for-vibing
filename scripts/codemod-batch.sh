#!/usr/bin/env bash
# 分批执行 jscodeshift，避免 recast AST 内存泄漏导致 OOM
# 每批默认 50 个文件，批间重启 Node 进程释放内存
#
# 用法:
#   bash scripts/codemod-batch.sh           # 执行转换
#   bash scripts/codemod-batch.sh --dry     # 预览变更 (不写文件)
#
# 环境变量:
#   FIX_IMPORTS_HEAP_MB     Node 堆内存 (MB), 默认 4096
#   FIX_IMPORTS_BATCH       每批文件数, 默认 50
set -euo pipefail

HEAP_MB="${FIX_IMPORTS_HEAP_MB:-4096}"
BATCH_SIZE="${FIX_IMPORTS_BATCH:-50}"
TRANSFORM="scripts/codemods/relative-to-alias.cjs"

DRY_FLAG=""
DRY_MODE=""
MODE_LABEL="转换"
for arg in "$@"; do
  if [ "$arg" = "--dry" ]; then
    DRY_MODE="1"
    MODE_LABEL="预览 (dry-run)"
  fi
done

echo "=== 相对路径 -> @trapmap 别名${MODE_LABEL} ==="
echo "堆内存: ${HEAP_MB}MB" 
if [ -n "$DRY_MODE" ]; then
  echo "模式: dry-run (仅预览)"
else
  echo "批次: ${BATCH_SIZE} 文件"
fi
echo ""

# 收集所有源码文件
mapfile -t files < <(
  find packages \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/dist/*' \
    -not -path '*/coverage/*' \
    2>/dev/null | sort
)

total=${#files[@]}
echo "扫描到 $total 个文件"
echo ""

ok_total=0
unmodified_total=0
skip_total=0
error_total=0

# 分批执行
for ((i=0; i<total; i+=BATCH_SIZE)); do
  batch=("${files[@]:i:BATCH_SIZE}")
  batch_count=${#batch[@]}

  batch_start=$((i + 1))
  batch_end=$((i + batch_count))
  printf "  [%4d-%4d/%d] " "$batch_start" "$batch_end" "$total"

  set +e

  if [ -n "$DRY_MODE" ]; then
    # dry-run: 直接传递文件路径 (不使用 --stdin，因为 --stdin --dry 不兼容)
    # 注意: --dry 模式下 --silent 会抑制结果输出，因此不加 --silent
    output=$(NODE_OPTIONS="--max-old-space-size=${HEAP_MB}" \
      npx jscodeshift -t "$TRANSFORM" "${batch[@]}" \
        --parser=tsx --extensions=ts,tsx --dry 2>&1)
  else
    # 实际写入: 使用 --stdin 批量处理 (不加 --silent，否则 jscodeshift 不输出结果计数)
    tmpfile=$(mktemp)
    printf '%s\n' "${batch[@]}" > "$tmpfile"
    output=$(cat "$tmpfile" | NODE_OPTIONS="--max-old-space-size=${HEAP_MB}" \
      npx jscodeshift -t "$TRANSFORM" --parser=tsx --extensions=ts,tsx --quote=single --cpus=1 --stdin 2>&1)
    rm -f "$tmpfile"
  fi

  rc=$?
  set -e

  # jscodeshift 输出格式: "N ok, M unmodified, K skipped, J errors"
  n_ok=$(echo "$output" | grep -oP '\d+(?= ok)' || echo 0)
  n_unmodified=$(echo "$output" | grep -oP '\d+(?= unmodified)' || echo 0)
  n_skip=$(echo "$output" | grep -oP '\d+(?= skipped)' || echo 0)
  n_error=$(echo "$output" | grep -oP '\d+(?= error)' || echo 0)

  ok_total=$((ok_total + n_ok))
  unmodified_total=$((unmodified_total + n_unmodified))
  skip_total=$((skip_total + n_skip))
  error_total=$((error_total + n_error))

  printf "OK=%d  UNCHANGED=%d  SKIPPED=%d  ERR=%d\n" "$n_ok" "$n_unmodified" "$n_skip" "$n_error"

  if [ "$n_error" -gt 0 ]; then
    echo "    错误输出: $output"
  fi
done

echo ""
if [ -n "$DRY_MODE" ]; then
  echo "=== 预览完成 (dry-run, 未修改文件) ==="
  echo "需要修改: $ok_total"
  echo "无需修改: $unmodified_total"
  echo "跳过:     $skip_total"
else
  echo "=== 转换完成 ==="
  echo "已修改:   $ok_total"
  echo "未修改:   $unmodified_total"
  echo "跳过:     $skip_total"
fi
if [ $error_total -gt 0 ]; then
  echo "出错:     $error_total"
  exit 1
fi
echo "总计:     $total"
