import type { NextPage } from "next";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useRouter } from "next/router";
import styles from "../styles/Home.module.css";

const DEFAULT_METRIC = "metrics.caseDensity";

const AnimatedMap = dynamic(() => import("components/AnimatedMap"), {
  ssr: false,
});

const Home: NextPage = () => {
  const router = useRouter();
  const metric = (router.query.metric as string[]) || [DEFAULT_METRIC];

  return (
    <div className={styles.container}>
      <Head>
        <title>anirona: animated coronavirus maps</title>
        <meta name="description" content="Animated coronavirus maps" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <AnimatedMap metric={metric} />
      </main>
    </div>
  );
};

export default Home;
