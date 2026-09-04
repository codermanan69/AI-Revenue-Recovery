import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState(null);
  const [recoveryCases, setRecoveryCases] = useState([]);

  const [actionLoading, setActionLoading] = useState(false);

  const [dashboardStats, setDashboardStats] = useState({
  revenueAtRisk: 0,
  recoveredRevenue: 0,
  openRecoveryCases: 0,
  recoveryRate: 0
});

  // ====================
  // FETCH RECOVERY CASES
  // ====================

  useEffect(() => {
  const fetchDashboardData = async () => {
    try {
      const recoveryResponse = await fetch(
        "http://localhost:5000/api/recovery-cases"
      );

      const recoveryData = await recoveryResponse.json();
      setRecoveryCases(recoveryData);

      const statsResponse = await fetch(
        "http://localhost:5000/api/dashboard/stats"
      );

      const statsData = await statsResponse.json();
      setDashboardStats(statsData);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    }
  };

  fetchDashboardData();
}, []);

const updateRecoveryStatus = async (id, status) => {
  try {
    const response = await fetch(
      `http://localhost:5000/api/recovery-cases/${id}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status: status
        })
      }
    );

    const updatedCase = await response.json();

    if (!response.ok) {
      throw new Error(updatedCase.error);
    }

    setRecoveryCases((cases) =>
      cases.map((item) =>
        item._id === id ? updatedCase : item
      )
    );

    const statsResponse = await fetch(
      "http://localhost:5000/api/dashboard/stats"
    );

    const statsData = await statsResponse.json();

    setDashboardStats(statsData);

  } catch (error) {
    console.error("Failed to update recovery status:", error);
  }
};

const handleRecoveryAction = async (id, action) => {
  if (actionLoading) return;
  try {
    setActionLoading(true);

    const response = await fetch(
      `http://localhost:5000/api/recovery-cases/${id}/action`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: action
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }

    // Update state in-place for the specific case
    if (data.recoveryCase) {
      setRecoveryCases((cases) =>
        cases.map((item) =>
          item._id === id ? data.recoveryCase : item
        )
      );
    }

    alert(data.message);

    // Refresh dashboard stats
    const statsResponse = await fetch(
      "http://localhost:5000/api/dashboard/stats"
    );

    const statsData = await statsResponse.json();

    setDashboardStats(statsData);

  } catch (error) {
    console.error("Recovery action failed:", error);
  } finally {
    setActionLoading(false);
  }
};
  // ====================
  // CREATE RAZORPAY ORDER
  // ====================

  const createOrder = async () => {
    try {
      setLoading(true);

      // 1. Backend se Razorpay order create
      const response = await fetch(
        "http://localhost:5000/api/orders",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          }
        }
      );

      const data = await response.json();

      setOrder(data);

      console.log("Order created:", data);

      // 2. Razorpay Checkout open
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: data.amount,
        currency: data.currency,
        name: "Revenue Recovery",
        description: "Test Payment",
        order_id: data.id,

        handler: async function (paymentResponse) {
          console.log("Payment successful:", paymentResponse);

          setPayment(paymentResponse);

          // 3. Payment backend par verify
          const verifyResponse = await fetch(
            "http://localhost:5000/api/payments/verify",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                razorpay_order_id:
                  paymentResponse.razorpay_order_id,

                razorpay_payment_id:
                  paymentResponse.razorpay_payment_id,

                razorpay_signature:
                  paymentResponse.razorpay_signature
              })
            }
          );

          const verifyData = await verifyResponse.json();

          console.log(
            "Verification response:",
            verifyData
          );

          if (verifyData.success) {
            alert("Payment verified successfully!");
          } else {
            alert("Payment verification failed!");
          }
        }
      };

      const razorpayCheckout =
  new window.Razorpay(options);

let isFailureHandled = false;

// Payment failed event
razorpayCheckout.on("payment.failed", async function (response) {
  if (isFailureHandled) return;
  isFailureHandled = true;

  console.log("Payment failed:", response);

const failureReason =
  response.error.reason === "payment_failed"
    ? response.error.description || "Payment failed"
    : response.error.reason || response.error.description || "Payment failed";  

  try {
    const failureResponse = await fetch(
      "http://localhost:5000/api/payments/failed",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
  amount: data.amount,
  failureReason: failureReason,
  razorpayOrderId: data.id
})
      }
    );

    const failureData = await failureResponse.json();

    if (!failureResponse.ok) {
      throw new Error(failureData.error);
    }

    console.log(
      "AI recovery case created:",
      failureData
    );

    // Dashboard mein new recovery case dikhao
    setRecoveryCases((cases) => [
      ...cases,
      failureData
    ]);

    // Dashboard stats refresh
    const statsResponse = await fetch(
      "http://localhost:5000/api/dashboard/stats"
    );

    const statsData = await statsResponse.json();

    setDashboardStats(statsData);

    alert(
      `Payment failed. AI recommendation: ${failureData.aiRecommendation}`
    );

  } catch (error) {
    console.error(
      "Failed to create recovery case:",
      error
    );
  }
});

razorpayCheckout.open();

    } catch (error) {
      console.error(
        "Error creating order:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  const simulateFailedPayment = async () => {
  try {
    const response = await fetch(
      "http://localhost:5000/api/payments/failed",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: 300000,
          failureReason: "Insufficient funds",
          attempts: 2
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error);
    }

    setRecoveryCases((cases) => [...cases, data]);

  } catch (error) {
    console.error("Failed payment simulation:", error);
  }
};

  // ====================
  // UI
  // ====================

  return (
    <div className="app">

      <header className="header">

        <div>
          <h1>Revenue Recovery</h1>
          <p>
            AI-powered payment recovery dashboard
          </p>
        </div>

        <div className="status">
          ● System Active
        </div>

      </header>


      <main className="dashboard">

        {/* ====================
            STATS
        ==================== */}

        <section className="stats">

          <div className="card">
            <p>Revenue at Risk</p>
            <h2>₹{dashboardStats.revenueAtRisk.toLocaleString("en-IN")}</h2>
            <span>From failed payments</span>
          </div>

          <div className="card">
            <p>Recovered Revenue</p>
            <h2>₹{dashboardStats.recoveredRevenue.toLocaleString("en-IN")}</h2>
            <span>Successfully recovered</span>
          </div>

          <div className="card">
            <p>Open Recovery Cases</p>
            <h2>{dashboardStats.openRecoveryCases}</h2>
            <span>Needs attention</span>
          </div>

          <div className="card">
            <p>Recovery Rate</p>
            <h2>{dashboardStats.recoveryRate}%</h2>
            <span>Overall recovery</span>
          </div>

        </section>


        {/* ====================
            RECOVERY CASES
        ==================== */}

        <section className="cases">

          <div className="section-heading">

            <div>
              <h2>Recovery Cases</h2>

              <p>
                Failed payments being analysed
              </p>
            </div>

            <button onClick={createOrder}>
              {loading
                ? "Creating..."
                : "Create Test Order"}
            </button>
            <button onClick={simulateFailedPayment}>
  Simulate Failed Payment
</button>

          </div>


          {/* MongoDB Recovery Cases */}

          {recoveryCases.map((recoveryCase) => (

            <div
              className="case"
              key={recoveryCase._id}
            >

              <div>

                <h3>
                  ₹{recoveryCase.amount / 100} Payment
                </h3>

                <p>
                  Failure reason:{" "}
                  {recoveryCase.failureReason}
                </p>

              </div>
              <div>
  <strong>
    AI Recommendation
  </strong>

  <p>
    {recoveryCase.aiRecommendation}
  </p>

  <strong>
    Why?
  </strong>

  <p>
    {recoveryCase.aiReason}
  </p>
</div>
             <div>

  <span
    className={
      recoveryCase.recoveryStatus ===
      "pending"
        ? "badge pending"
        : "badge"
    }
  >
    {recoveryCase.recoveryStatus}
  </span>

  {recoveryCase.recoveryStatus === "pending" && (
   <div style={{ marginTop: "10px" }}>

     {recoveryCase.aiRecommendation === "retry" && (
       <button
         disabled={actionLoading}
         onClick={() =>
           handleRecoveryAction(
             recoveryCase._id,
             "retry"
           )
         }
       >
         Retry Payment
       </button>
     )}

     {recoveryCase.aiRecommendation === "reminder" && (
       <button
         disabled={actionLoading}
         onClick={() =>
           handleRecoveryAction(
             recoveryCase._id,
             "reminder"
           )
         }
       >
         Send Reminder
       </button>
     )}

     {recoveryCase.aiRecommendation === "stop" && (
       <button
         disabled={actionLoading}
         onClick={() =>
           handleRecoveryAction(
             recoveryCase._id,
             "stop"
           )
         }
       >
         Stop Recovery
       </button>
     )}

   </div>
 )}

{(recoveryCase.actionHistory && recoveryCase.actionHistory.length > 0) && (
  <div style={{ marginTop: "12px", borderTop: "1px dashed #ccc", paddingTop: "8px" }}>
    <strong>Action History:</strong>
    <ul style={{ margin: "5px 0 0 18px", padding: 0, fontSize: "0.85em" }}>
      {recoveryCase.actionHistory.map((item, idx) => {
        const actionLabels = {
          reminder: "Reminder sent",
          retry: "Payment retry initiated",
          stop: "Recovery stopped"
        };
        const label = actionLabels[item.action] || item.action;
        const timeStr = item.actionAt ? new Date(item.actionAt).toLocaleString() : "";
        return (
          <li key={item._id || idx}>
            {label} {timeStr && `(${timeStr})`}
          </li>
        );
      })}
    </ul>
  </div>
)}

</div>

            </div>

          ))}

        </section>


        {/* ====================
            LATEST ORDER
        ==================== */}

        {order && (

          <section
            className="cases"
            style={{ marginTop: "25px" }}
          >

            <h2>
              Latest Razorpay Order
            </h2>

            <p style={{ marginTop: "15px" }}>
              Order ID: {order.id}
            </p>

            <p>
              Amount: ₹{order.amount / 100}
            </p>

            <p>
              Status: {order.status}
            </p>

          </section>

        )}


        {/* ====================
            PAYMENT SUCCESS
        ==================== */}

        {payment && (

          <section
            className="cases"
            style={{ marginTop: "25px" }}
          >

            <h2>
              Payment Successful
            </h2>

            <p style={{ marginTop: "15px" }}>
              Payment ID:{" "}
              {payment.razorpay_payment_id}
            </p>

            <p>
              Order ID:{" "}
              {payment.razorpay_order_id}
            </p>

            <p>
              Signature received ✓
            </p>

          </section>

        )}

      </main>

    </div>
  );
}

export default App;