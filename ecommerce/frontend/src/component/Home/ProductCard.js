import React, { Fragment, useState, useEffect } from 'react'
import { Link } from "react-router-dom";
import ReactStars from "react-rating-stars-component";
import "./Home.css"

const ProductCard = ({ product }) => {
  const options = {
    edit: false,
    color: "rgba(20,20,20,0.1)",
    activeColor: "tomato",
    size: window.innerWidth < 600 ? 20 : 25,
    value: product.ratings,
    isHalf: true,
  };

  /* Contador regressivo de promoções*/
  const [timerDays, setTimerDays] = useState();
  const [timerHours, setTimerHours] = useState();
  const [timerMinutes, setTimerMinute] = useState();
  const [timerSeconds, setTimerSeconds] = useState();
  
  useEffect(() => {
    const countDownDate = new Date(product.countDown).getTime();
    const updateTimer = () => {
      const remaining = countDownDate - Date.now();
      const distance = Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
      const days = Math.floor(distance / (24 * 60 * 60 * 1000));
      const hours = Math.floor((distance % (24 * 60 * 60 * 1000)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (60 * 60 * 1000)) / (1000 * 60));
      const seconds = Math.floor((distance % (60 * 1000)) / 1000);

      setTimerDays(days);
      setTimerHours(hours);
      setTimerMinute(minutes);
      setTimerSeconds(seconds);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [product.countDown]);

  return (
    <Fragment>
      <div id="product">
        <Link className="productCard" to={`/product/${product._id}`}>
          <div className="contadorPromocao" alt="contadorPromocao" >
            <span className="OFF">{product.off}% OFF</span>
            <span className="countOff"
              timerDays={timerDays}
              timerHours={timerHours}
              timerMinute={timerMinutes}
              timerSeconds={timerSeconds}
            >
              </span>
              <div className="countOffProduct">
                <div>
                    <p>{timerDays}</p>
                    <small>Dias</small>
                </div>{" "}
                <div>
                    <p>{timerHours}</p>
                    <small>HRs</small>
                </div>{" "}
                <div>
                    <p>{timerMinutes}</p>
                    <small>Min.</small>
                </div>
                <div>
                    <p>{timerSeconds}</p>
                    <small>Seg.</small>
                </div>
            </div>
            <div className="countExpire">Teste</div>
          </div>
          <img src={product.images[0].url} alt={product.name} />
          <p className="productName">{product.name}</p>
          <div>
            <ReactStars {...options} />{" "}
            <span>({product.numOfReviews} Reviews)</span>
          </div>
          <span className="oldPrice">De {`R$ ${product.oldPrice}`} por</span>
          <span className="productPrice">{`R$ ${product.price}`} Preço à vista.</span>
          <span className="installmmentPrice">ou em 12x de {` R$ ${product.installmmentPrice}`} sem juros.</span>
        </Link>
        <button className="buttomCard" value="">Adcionar ao Carrinho.</button>
      </div>
    </Fragment>
  );
};

export default ProductCard;
