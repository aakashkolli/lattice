import type { SVGProps } from 'react';


interface LatticeIconProps extends SVGProps<SVGSVGElement> {
 size?: number;
 color?: string;
}


export function LatticeIcon({
 size = 24,
 color = 'currentColor',
 ...props
}: LatticeIconProps) {
 return (
   <svg
     width={size}
     height={size}
     viewBox="0 0 24 24"
     fill="none"
     xmlns="http://www.w3.org/2000/svg"
     aria-hidden="true"
     {...props}
   >
     {/* Sharp Grid Lines */}
     <path
       d="M4 8h16M4 12h16M4 16h16M8 4v16M12 4v16M16 4v16"
       stroke={color}
       strokeWidth="1.5"
       strokeLinecap="round"
       strokeLinejoin="round"
     />
   </svg>
 );
}


export default LatticeIcon;





