import axios from "axios";
import type { InferGetServerSidePropsType, NextPage } from "next";
import Head from "next/head";
import type { RegionSummaryWithTimeseries } from "typings/codegen/CovidActNow";
import styles from "../styles/Home.module.css";

export const getServerSideProps = async () => {
  const res = await axios.get<RegionSummaryWithTimeseries>(
    "/api/timeseries/actuals.cases"
  );
  return {
    props: {
      data: res.data,
    },
  };
};

type HomeProps = InferGetServerSidePropsType<typeof getServerSideProps>;

const Home: NextPage<HomeProps> = ({ data }) => {
  return (
    <div className={styles.container}>
      <Head>
        <title>aniRona: animated coronavirus maps</title>
        <meta name="description" content="Animated coronavirus maps" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <pre>{JSON.stringify(data)}</pre>
      </main>

      <footer className={styles.footer}>never stop posting.</footer>
    </div>
  );
};

export default Home;
