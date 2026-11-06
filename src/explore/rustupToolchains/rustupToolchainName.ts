declare const rustupToolchainNameBrand: unique symbol;

/** A toolchain name `rustup toolchain list` gave, checked so it never reads as an option. */
export type RustupToolchainName = string & { [rustupToolchainNameBrand]: true };
