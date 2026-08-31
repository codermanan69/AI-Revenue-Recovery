import { useState } from "react";
import "./App.css";

function App() {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [payment, setPayment] = useState(null);

  const createOrder = async () => {
  try {
    setLoading(true);

    // 1. Backend se Razorpay order create
    const response = await fetch("http://localhost:5000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

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
              razorpay_order_id: paymentResponse.razorpay_order_id,
              razorpay_payment_id: paymentResponse.razorpay_payment_id,
              razorpay_signature: paymentResponse.razorpay_signature
            })
          }
        );

        const verifyData = await verifyResponse.json();

        console.log("Verification response:", verifyData);

        if (verifyData.success) {
          alert("Payment verified successfully!");
        } else {
          alert("Payment verification failed!");
        }
      }
    };

    const razorpayCheckout = new window.Razorpay(options);

    razorpayCheckout.open();

  } catch (error) {
    console.error("Error creating order:", error);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="app">

      <header className="header">
        <div>
          <h1>Revenue Recovery</h1>
          <p>AI-powered payment recovery dashboard</p>
        </div>

        <div className="status">
          ● System Active
        </div>
      </header>


      <main className="dashboard">

        <section className="stats">

          <div className="card">
            <p>Revenue at Risk</p>
            <h2>₹50,000</h2>
            <span>From failed payments</span>
          </div>

          <div className="card">
            <p>Recovered Revenue</p>
            <h2>₹32,000</h2>
            <span>Successfully recovered</span>
          </div>

          <div className="card">
            <p>Open Recovery Cases</p>
            <h2>8</h2>
            <span>Needs attention</span>
          </div>

          <div className="card">
            <p>Recovery Rate</p>
            <h2>64%</h2>
            <span>Overall recovery</span>
          </div>

        </section>


        <section className="cases">

          <div className="section-heading">

            <div>
              <h2>Recovery Cases</h2>
              <p>Failed payments being analysed</p>
            </div>

            <button onClick={createOrder}>
              {loading ? "Creating..." : "Create Test Order"}
            </button>

          </div>


          <div className="case">

            <div>
              <h3>₹3,000 Payment</h3>
              <p>Failure reason: Insufficient funds</p>
            </div>

            <div>
              <strong>AI Recommendation</strong>
              <p>Retry</p>
            </div>

            <div>
              <span className="badge">Recovered</span>
            </div>

          </div>


          <div className="case">

            <div>
              <h3>₹5,000 Payment</h3>
              <p>Failure reason: Payment declined</p>
            </div>

            <div>
              <strong>AI Recommendation</strong>
              <p>Reminder</p>
            </div>

            <div>
              <span className="badge pending">Pending</span>
            </div>

          </div>


          <div className="case">

            <div>
              <h3>₹2,000 Payment</h3>
              <p>Failure reason: Bank error</p>
            </div>

            <div>
              <strong>AI Recommendation</strong>
              <p>Retry</p>
            </div>

            <div>
              <span className="badge">Recovered</span>
            </div>

          </div>

        </section>


        {order && (
          <section
            className="cases"
            style={{ marginTop: "25px" }}
          >

            <h2>Latest Razorpay Order</h2>

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


        {payment && (
          <section
            className="cases"
            style={{ marginTop: "25px" }}
          >

            <h2>Payment Successful</h2>

            <p style={{ marginTop: "15px" }}>
              Payment ID: {payment.razorpay_payment_id}
            </p>

            <p>
              Order ID: {payment.razorpay_order_id}
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