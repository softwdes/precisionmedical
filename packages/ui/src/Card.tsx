/**
 * Card Component
 * 
 * Canonical card pattern. Used as base for all containers.
 * 
 * Composition pattern: <Card>, <CardHeader>, <CardTitle>, <CardBody>, <CardFooter>
 */

import * as React from 'react';
import { cn } from '../utils/cn';

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative rounded-[14px] border border-border bg-gradient-to-b from-surface to-bg-2 p-5 shadow-soft transition-all duration-300 ease-out',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-start justify-between mb-3.5', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-[15px] font-bold tracking-[-0.01em] text-text-1',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

export const CardLabel = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      'text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-3',
      className
    )}
    {...props}
  />
));
CardLabel.displayName = 'CardLabel';

export const CardBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex-1', className)} {...props} />
));
CardBody.displayName = 'CardBody';

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('mt-4 pt-3 border-t border-border', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

/**
 * Usage:
 * 
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Active employees</CardTitle>
 *     <Badge variant="emerald">+8.2%</Badge>
 *   </CardHeader>
 *   <CardBody>
 *     <p className="font-mono text-[28px] font-bold tracking-[0.02em] text-text-1">
 *       2,847
 *     </p>
 *     <p className="text-xs text-text-3 mt-1">vs last month</p>
 *   </CardBody>
 * </Card>
 */
