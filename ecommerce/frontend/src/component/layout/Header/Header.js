import { Link } from "react-router-dom";
import categories from "../../../data/categories.json";
import React from 'react';
import LogoFetech from "../../../images/ProjetoLogoFetech2.svg";
import "../Header/Header.css"
import { useState, useRef, useEffect } from "react";
import Search from '../../Product/Search';
import Buttom from '../Navbar/Buttom';
//import CheckOutsideClick from './CheckOutsideClick';

const Header = () => {
  const [isActive, setIsActive] = useState(false);
  const onButtonClick = () => {
    toggleDropMenu();
  }

  const dropDownRef = useRef(null);
  const menuButtonRef = useRef(null);
  useEffect(() => {
    const closeOutside = event => {
      if (!dropDownRef.current?.contains(event.target) && !menuButtonRef.current?.contains(event.target)) setIsActive(false);
    };
    const closeOnEscape = event => { if (event.key === 'Escape') setIsActive(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, []);

  const toggleDropMenu = () => {
    setIsActive(prev => !prev)
  }

  return (
    <header>
      <div className="nav-area">
        <a href='/'>
          <img src={LogoFetech} width={180} className="Header-Logo" alt="logo" title="Logo Fetech Informática" />
        </a>
        <button
          ref={menuButtonRef}
          aria-expanded={isActive}
          aria-controls="department-menu"
          onClick={onButtonClick}
          className="menu-buttom"
          title="Compre por Departamento">
          <span>Compre por departamento</span>
        </button>
        <nav id="department-menu" aria-label="Departamentos" ref={dropDownRef} className={`menu ${isActive ? "active" : "inactive"}`}>
          <div id="ulDropDown" alt="UL DropDown" title="Lista">
            <ul>
              {categories.map(category => <li key={category}><Link className="list" to={'/products?category=' + encodeURIComponent(category)} onClick={() => setIsActive(false)}>{category}</Link></li>)}
              <li><Link className="list" to="/products" onClick={() => setIsActive(false)}>Listar Todos Os Produtos</Link></li>
            </ul>
          </div>
        </nav>
        <Search />
        <Buttom />
        <Link to="/cart" aria-label="Carrinho">Carrinho</Link>
      </div>
    </header>
  );
};
export default Header;
