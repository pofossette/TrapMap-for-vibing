import { motion } from 'framer-motion';
import type { PropsWithChildren, ReactElement } from 'react';

type PageTransitionProps = PropsWithChildren<{
  className?: string;
}>;

export function PageTransition({ children, className = '' }: PageTransitionProps): ReactElement {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={className}
      exit={{ opacity: 0, y: -12 }}
      initial={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
