declare module 'framer-motion' {
  import * as React from 'react';

  export interface MotionProps {
    initial?: any;
    animate?: any;
    transition?: any;
    className?: string;
    style?: React.CSSProperties;
    [key: string]: any;
  }

  export interface MotionComponent extends React.FC<MotionProps> {
    [key: string]: any;
  }

  export const motion: {
    div: MotionComponent;
    span: MotionComponent;
    button: MotionComponent;
    a: MotionComponent;
    ul: MotionComponent;
    ol: MotionComponent;
    li: MotionComponent;
    header: MotionComponent;
    footer: MotionComponent;
    nav: MotionComponent;
    main: MotionComponent;
    section: MotionComponent;
    article: MotionComponent;
    aside: MotionComponent;
    [key: string]: MotionComponent;
  };
}