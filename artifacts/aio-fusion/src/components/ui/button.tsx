import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-[13px] font-bold transition-[background-color,border-color,color,filter,transform] duration-200 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
" hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
           "bg-primary text-primary-foreground border border-primary-border",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border-destructive-border",
        outline:
          // @replit Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          " border [border-color:var(--button-outline)] shadow-xs active:shadow-none ",
        secondary:
          // @replit border, no hover, no shadow, secondary border.
          "border bg-secondary text-secondary-foreground border border-secondary-border ",
        // @replit no hover, transparent border
        ghost: "border border-transparent",
        link: "min-h-9 bg-transparent px-2 text-primary underline-offset-4 hover:underline",
        text: "min-h-9 border border-transparent bg-transparent px-2 text-foreground hover:bg-muted",
        navigation:
          "bg-[#C8497A] text-white uppercase tracking-[0.12em] hover:brightness-110 active:translate-y-px",
      },
      size: {
        // @replit changed sizes
        default: "min-h-11 px-[18px] py-2.5",
        sm: "min-h-9 rounded-[10px] px-3 text-xs",
        lg: "min-h-12 px-7 text-sm",
        icon: "h-11 w-11 p-0",
        compact: "min-h-9 rounded-[10px] px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
