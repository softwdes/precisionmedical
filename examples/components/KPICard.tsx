/**
 * KPICard Component
 * 
 * Dashboard KPI card with icon, value, trend, and sparkline.
 * The signature card of the dashboard view.
 */

import * as React from 'react';
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react';
import { Card } from './Card';
import { cn } from '../utils/cn';

interface KPICardProps {
  /** Icon to display */
  icon: LucideIcon;
  /** Color theme */
  color?: 'brand' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'violet';
  /** Label (uppercase, small) */
  label: string;
  /** Main value */
  value: string | number;
  /** Subtitle/description */
  subtitle?: string;
  /** Trend percentage (positive or negative) */
  trend?: number;
  /** Trend period label */
  trendLabel?: string;
  /** Sparkline data (array of numbers) */
  sparklineData?: number[];
  /** Click handler for drill-down */
  onClick?: () => void;
}

const colorMap = {
  brand: { bg: 'bg-brand/10', border: 'border-brand/25', text: 'text-brand', glow: 'rgba(99,102,241,0.15)' },
  cyan: { bg: 'bg-cyan/10', border: 'border-cyan/25', text: 'text-cyan', glow: 'rgba(6,182,212,0.15)' },
  emerald: { bg: 'bg-emerald/10', border: 'border-emerald/25', text: 'text-emerald', glow: 'rgba(16,185,129,0.15)' },
  amber: { bg: 'bg-amber/10', border: 'border-amber/25', text: 'text-amber', glow: 'rgba(245,158,11,0.15)' },
  rose: { bg: 'bg-rose/10', border: 'border-rose/25', text: 'text-rose', glow: 'rgba(244,63,94,0.15)' },
  violet: { bg: 'bg-brand-2/10', border: 'border-brand-2/25', text: 'text-brand-2', glow: 'rgba(139,92,246,0.15)' },
};

export const KPICard: React.FC<KPICardProps> = ({
  icon: Icon,
  color = 'brand',
  label,
  value,
  subtitle,
  trend,
  trendLabel = 'vs last month',
  sparklineData,
  onClick,
}) => {
  const colors = colorMap[color];
  const isPositive = trend !== undefined && trend >= 0;
  
  return (
    <Card
      className={cn(
        'group flex flex-col gap-3 cursor-pointer hover:border-border-strong hover:-translate-y-0.5',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      {/* Top row: icon + label + trend */}
      <div className="flex items-start justify-between">
        <div
          className={cn(
            'w-9 h-9 rounded-[10px] grid place-items-center',
            colors.bg,
            'border',
            colors.border
          )}
        >
          <Icon className={cn('w-[18px] h-[18px]', colors.text)} strokeWidth={1.8} />
        </div>
        
        {trend !== undefined && (
          <div
            className={cn(
              'flex items-center gap-1 text-[11px] font-bold tracking-tight',
              isPositive ? 'text-emerald' : 'text-rose'
            )}
          >
            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>
              {isPositive ? '+' : ''}
              {trend.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
      
      {/* Label */}
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-text-3">
        {label}
      </span>
      
      {/* Value */}
      <div className="font-mono text-[28px] font-bold tracking-[0.02em] text-text-1 leading-none">
        {value}
      </div>
      
      {/* Subtitle / trend */}
      {subtitle && (
        <p className="text-[11.5px] text-text-3 -mt-1">
          {subtitle}
        </p>
      )}
      
      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="h-9 mt-1">
          <Sparkline data={sparklineData} color={colors.glow} />
        </div>
      )}
    </Card>
  );
};

/**
 * Inline mini-sparkline using SVG.
 * Creates a smooth gradient-filled line chart.
 */
const Sparkline: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  if (data.length < 2) return null;
  
  const width = 100;
  const height = 36;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  });
  
  const path = `M ${points.join(' L ')}`;
  const fillPath = `${path} L ${width},${height} L 0,${height} Z`;
  
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full h-full"
    >
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#grad-${color})`} />
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/**
 * Usage:
 * 
 * <KPICard
 *   icon={Users}
 *   color="cyan"
 *   label="Active employees"
 *   value="2,847"
 *   trend={8.2}
 *   sparklineData={[42, 45, 43, 50, 55, 58, 62]}
 *   onClick={() => router.push('/employees')}
 * />
 */
