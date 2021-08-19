import Document, { Head, Html, Main, NextScript } from "next/document";
import React from "react";

export default class MainDocument extends Document {
  render() {
    return (
      <Html>
        <Head>
          <link
            rel="stylesheet"
            href="https://cdn.jsdelivr.net/gh/aymanbagabas/iosevka-fonts@v10.0.0/dist/iosevka/iosevka.min.css"
          />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
