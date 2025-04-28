import { Idl } from '@project-serum/anchor';

declare module '*.json' {
  const value: Idl;
  export default value;
}
