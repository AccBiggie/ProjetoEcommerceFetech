import React from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router';
import { FaUserCircle } from 'react-icons/fa';
import './Buttom.css';
export default function Buttom() {
    const { isAuthenticated } = useSelector(state => state.user);
    return <div className={isAuthenticated ? 'buttonLoginFormUser' : 'buttonLogin'}>
        <Link to={isAuthenticated ? '/account' : '/login'} aria-label={isAuthenticated ? 'Minha conta' : 'Entrar'} className="ButtonLogin"><FaUserCircle className="iconUser" /></Link>
    </div>;
}
