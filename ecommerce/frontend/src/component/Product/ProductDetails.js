import React, { Fragment, useEffect, useState } from 'react'
import Carousel from "react-material-ui-carousel";
import "./ProductDetails.css";
import { useSelector, useDispatch } from "react-redux";
import { getProductDetails } from "../../actions/productAction";
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import Page from '../layout/Page';
import { getErrorMessage } from '../../utils/api';
import ReactStars from 'react-rating-stars-component';
import ReviewCard from './ReviewCard';
import Loader from '../layout/Loader/Loader.js';
import { useAlert } from "react-alert"
import Header from '../layout/Header/Header.js';
import MetaData from '../layout/MetaData';
import { addItemsToCart } from '../../actions/cartAction';

const ProductDetails = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const alert = useAlert();

  const { product, loading, error } = useSelector((state) => state.productDetails);
  const { user, isAuthenticated } = useSelector(state => state.user);
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [pending, setPending] = useState(false);

  const [quantity, setQuantity] = useState(1);
  const increaseQuantity = () => {
    if (product.Stock <= quantity) {
      return;
    }
    const qty = quantity + 1;
    setQuantity(qty);
  };

  const decreaseQuantity = () => {
    if (quantity <= 1)
      return;
    const qty = quantity - 1;
    setQuantity(qty);
  }

  const addToCartHandler = async () => {
    try { await dispatch(addItemsToCart(product._id, quantity)); alert.success("Produto adicionado ao carrinho."); }
    catch (error) { alert.error(getErrorMessage(error)); }
  }
  const submitReview = async event => {
    event.preventDefault(); setPending(true); setReviewError('');
    try {
      await axios.put('/api/v1/review', { productId: id, rating: Number(rating), comment });
      setComment(''); dispatch(getProductDetails(id)); alert.success('Avaliação salva.');
    } catch (error) { setReviewError(getErrorMessage(error)); }
    finally { setPending(false); }
  };
  const removeReview = async reviewId => {
    setPending(true); setReviewError('');
    try { await axios.delete('/api/v1/reviews', { params: { productId: id, id: reviewId } }); dispatch(getProductDetails(id)); }
    catch (error) { setReviewError(getErrorMessage(error)); }
    finally { setPending(false); }
  };

    useEffect(() => {
      setQuantity(1); setReviewError('');
      dispatch(getProductDetails(id));
    }, [dispatch, id]);

  if (error) return <Page title="Produto indisponível"><p role="alert">{error}</p><Link to="/products">Ver produtos</Link></Page>;
  if (loading || !product?._id || product._id !== id) return <Loader />;

  const options = {
    edit: false,
    color: "rgba(20,20,20,0.1)",
    activeColor: "tomato",
    size: window.innerWidth < 600 ? 20 : 25,
    value: product.ratings,
    isHalf: true,
  }

  return (
    <Fragment>
      {loading ? (
        <Loader />
      ) : (
        <Fragment>
          <MetaData title={`${product.name} --Ecommerce`} />
          <nav id="navBar">
            <Header></Header>
          </nav>
          <div className="ProductDetails">
            <div className="ProductDetailsImage">
              <Carousel>
                {product.images &&
                  product.images.map((item, i) => (
                    <img
                      className="CarouselImage"
                      key={item.url}
                      src={item.url}
                      alt={`${i} Slide`}
                    />
                  ))}
              </Carousel>
            </div>

            <div className="ProductDetailsSale">
              <div className="detailsBlock-1">
                <h2>{product.name}</h2>
                <p>Product # {product._id}</p>
              </div>
              <div className="detailsBlock-2">
                <ReactStars {...options} />
                <span> ({product.numOfReviews} Reviews)</span>
              </div>
              <div className="detailsBlock-3">
                <h1>{`R$ ${product.price}`}</h1>
                <div className="detailsBlock-3-1">
                  <div className="detailsBlock-3-1-1">
                    <button onClick={decreaseQuantity}>-</button>
                    <input  readOnly value={quantity} type="number" />
                    <button onClick={increaseQuantity}>+</button>
                  </div>
                  <button onClick={addToCartHandler} disabled={product.Stock < quantity}>Adicionar ao Carrinho</button>
                </div>
                <p>
                  Status:
                  <b className={product.Stock < 1 ? "redColor" : "greenColor"}>
                    {product.Stock < 1 ? "Sem Estoque" : "Em Estoque"}
                  </b>
                </p>
              </div>
            </div>
          </div>

          <div className="detailsBlock-4">
            Descrição técnicas do Produto: <p>{product.description}</p>
          </div>
          {reviewError && <p role="alert">{reviewError}</p>}
          {isAuthenticated ? <form onSubmit={submitReview} className="contentPage">
            <label>Nota<select value={rating} onChange={e => setRating(e.target.value)}>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Comentário<textarea required value={comment} onChange={e => setComment(e.target.value)} /></label>
            <button type="submit" disabled={pending}>Enviar comentário</button>
          </form> : <Link to="/login" state={{ returnTo: `/product/${id}` }}>Entre para avaliar</Link>}

          <h3 className="reviewsHeading">COMENTÁRIOS</h3>

          {product.reviews && product.reviews[0] ? (
            <div className="reviews">
              {product.reviews &&
                product.reviews.map((review) => <div key={review._id}><ReviewCard review={review} />{user && (user.role === 'admin' || user._id === review.user) && <button disabled={pending} onClick={() => removeReview(review._id)}>Remover avaliação</button>}</div>)}
            </div>
          ) : (
            <p className="noReviews">Sem Reviews</p>
          )}
        </Fragment>
      )}
    </Fragment>
  );
};
export default ProductDetails;
