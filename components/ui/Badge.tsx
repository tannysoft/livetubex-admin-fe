interface BadgeProps {
  label: string
  colorClass: string
}

export default function Badge({ label, colorClass }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {label}
    </span>
  )
}
