import { useState, useRef, React } from "react";
import Xello from "./core/Xello";
import classes from "./css/Query.module.css";
import Header from "./core/Header";
import Xellex from "./core/Xellex";
import Xelve from "./core/Xelve";

function App() {
  const [activeTab, setActiveTab] = useState(<Xello />);

  const changeTab = (parameter, event) => {
    if (!parameter) {
      return <Xello />;
    }
    setActiveTab((prev) => {
      return parameter;
    });
  };

  var xellexPlaceholder; // = <Xellex />;
  var xelvePlaceholder; // = <Xelve />;

  return (
    <>
      <Header />
      <div className={classes.version}>1.0.6</div>
      <div className={classes.tabcontainer}>
        <div className={classes.tab}>
          <button
            className={classes.tablinks}
            onClick={() => {
              changeTab(<Xello />);
            }}
          >
            Lookup
          </button>
          <button
            className={classes.inactivetablinks}
            onClick={() => {
              changeTab(xellexPlaceholder);
            }}
          >
            Fix
          </button>
          <button
            className={classes.inactivetablinks}
            onClick={() => {
              changeTab(xelvePlaceholder);
            }}
          >
            Install
          </button>
        </div>
        {activeTab}
      </div>
    </>
  );
}

export default App;
