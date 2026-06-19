import { motion } from 'framer-motion';
import type { PropsWithChildren, ReactElement } from 'react';

type FadeInProps = PropsWithChildren<{
  className?: string;
  delay?: number;
  duration?: number;
}>;

export function FadeIn({
  children,
  className = '',
  delay = 0,
  duration = 0.24,
}: FadeInProps): ReactElement {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className={className}
      initial={{ opacity: 0, scale: 0.98 }}
      transition={{ duration, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
